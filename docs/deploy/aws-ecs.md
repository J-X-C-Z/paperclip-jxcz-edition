---
title: AWS ECS Fargate 部署
summary: 使用 ECS Fargate、RDS Postgres 和 EFS 在 AWS 上部署 Paperclip
---

本指南使用 ECS Fargate（计算）、RDS Postgres 17（数据库）和 EFS（持久化存储）在 AWS 上部署 Paperclip。操作通过 AWS CLI 完成，最终创建由 ALB 和 HTTPS 保护的单任务 ECS 服务。

<a id="prerequisites"></a>

## 前置条件

- 已配置 AWS CLI v2，使用的 profile 具有管理员级权限
- 本机已安装 Docker（用于构建和推送镜像）
- 已注册且 DNS 由你控制的域名（用于 TLS 证书）
- 已在本机克隆 Paperclip 仓库

为后续步骤设置以下 shell 变量：

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export PAPERCLIP_DOMAIN=paperclip.example.com   # your domain
export DB_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
export AUTH_SECRET=$(openssl rand -base64 32)
```

<a id="1-create-ecr-repository"></a>

## 1. 创建 ECR 仓库

```bash
aws ecr create-repository \
  --repository-name paperclip-server \
  --image-scanning-configuration scanOnPush=true \
  --region $AWS_REGION
```

<a id="2-build-and-push-docker-image"></a>

## 2. 构建并推送 Docker 镜像

```bash
cd /path/to/paperclip

# 将 Docker 登录到 ECR
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin \
    $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 构建
docker build -t paperclip-server .

# 标记并推送
docker tag paperclip-server:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/paperclip-server:latest

docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/paperclip-server:latest
```

<a id="3-networking-vpc-subnets-security-groups"></a>

## 3. 网络配置（VPC、子网、安全组）

可以使用默认 VPC，也可以创建专用 VPC。本指南假设使用默认 VPC，其中包含位于两个 AZ 的公有和私有子网。

```bash
# 获取默认 VPC
VPC_ID=$(aws ec2 describe-vpcs \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' --output text)

# 获取两个公有子网（用于 ALB）
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters Name=vpc-id,Values=$VPC_ID \
  --query 'Subnets[?MapPublicIpOnLaunch==`true`] | [0:2].SubnetId' \
  --output text)
SUBNET_1=$(echo $SUBNET_IDS | awk '{print $1}')
SUBNET_2=$(echo $SUBNET_IDS | awk '{print $2}')
```

创建安全组：

```bash
# ALB 安全组——允许入站 HTTPS
ALB_SG=$(aws ec2 create-security-group \
  --group-name paperclip-alb \
  --description "Paperclip ALB" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 443 --cidr 0.0.0.0/0

# 同时开放 80 端口，使 ALB 可接收 HTTP 并重定向到 HTTPS
aws ec2 authorize-security-group-ingress \
  --group-id $ALB_SG \
  --protocol tcp --port 80 --cidr 0.0.0.0/0

# ECS task 安全组——仅允许来自 ALB 的入站流量
ECS_SG=$(aws ec2 create-security-group \
  --group-name paperclip-ecs \
  --description "Paperclip ECS tasks" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $ECS_SG \
  --protocol tcp --port 3100 \
  --source-group $ALB_SG

# RDS 安全组——仅允许来自 ECS 的入站流量
RDS_SG=$(aws ec2 create-security-group \
  --group-name paperclip-rds \
  --description "Paperclip RDS" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $RDS_SG \
  --protocol tcp --port 5432 \
  --source-group $ECS_SG

# EFS 安全组——仅允许来自 ECS 的入站 NFS 流量
EFS_SG=$(aws ec2 create-security-group \
  --group-name paperclip-efs \
  --description "Paperclip EFS" \
  --vpc-id $VPC_ID \
  --query 'GroupId' --output text)

aws ec2 authorize-security-group-ingress \
  --group-id $EFS_SG \
  --protocol tcp --port 2049 \
  --source-group $ECS_SG
```

<a id="4-create-rds-postgres-instance"></a>

## 4. 创建 RDS Postgres 实例

```bash
# 自定义 VPC 不会自带默认 DB subnet group——创建一个覆盖这两个子网的 subnet group，
# 以便 RDS 可以在其中放置实例。
aws rds create-db-subnet-group \
  --db-subnet-group-name paperclip-db-subnet \
  --db-subnet-group-description "Paperclip RDS subnets" \
  --subnet-ids $SUBNET_1 $SUBNET_2

aws rds create-db-instance \
  --db-instance-identifier paperclip-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 17 \
  --master-username paperclip \
  --master-user-password "$DB_PASSWORD" \
  --allocated-storage 20 \
  --storage-type gp3 \
  --vpc-security-group-ids $RDS_SG \
  --db-subnet-group-name paperclip-db-subnet \
  --no-publicly-accessible \
  --backup-retention-period 7 \
  --no-multi-az \
  --db-name paperclip \
  --region $AWS_REGION

# 等待实例变为可用（需要 5–10 分钟）
aws rds wait db-instance-available \
  --db-instance-identifier paperclip-db

# 获取 endpoint
RDS_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier paperclip-db \
  --query 'DBInstances[0].Endpoint.Address' --output text)

DATABASE_URL="postgresql://paperclip:${DB_PASSWORD}@${RDS_ENDPOINT}:5432/paperclip"
```

<a id="5-create-efs-filesystem"></a>

## 5. 创建 EFS 文件系统

```bash
EFS_ID=$(aws efs create-file-system \
  --performance-mode generalPurpose \
  --throughput-mode bursting \
  --encrypted \
  --tags Key=Name,Value=paperclip-data \
  --query 'FileSystemId' --output text)

# 在每个子网中创建 mount target
for SUBNET in $SUBNET_1 $SUBNET_2; do
  aws efs create-mount-target \
    --file-system-id $EFS_ID \
    --subnet-id $SUBNET \
    --security-groups $EFS_SG
done

# 等待 mount target 创建完成
aws efs describe-mount-targets --file-system-id $EFS_ID
```

<a id="6-store-secrets"></a>

## 6. 存储密钥

```bash
aws secretsmanager create-secret \
  --name paperclip/database-url \
  --secret-string "$DATABASE_URL"

aws secretsmanager create-secret \
  --name paperclip/anthropic-api-key \
  --secret-string "YOUR_ANTHROPIC_KEY"

aws secretsmanager create-secret \
  --name paperclip/better-auth-secret \
  --secret-string "$AUTH_SECRET"

aws secretsmanager create-secret \
  --name paperclip/openai-api-key \
  --secret-string "YOUR_OPENAI_KEY"

aws secretsmanager create-secret \
  --name paperclip/github-token \
  --secret-string "YOUR_GITHUB_PAT"
```

<a id="7-iam-roles"></a>

## 7. IAM 角色

创建 ECS task execution role（用于拉取镜像、读取密钥）和 task role（用于应用权限）。

```bash
# Task execution role
aws iam create-role \
  --role-name paperclip-ecs-execution \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

aws iam attach-role-policy \
  --role-name paperclip-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# 授予读取密钥的权限
aws iam put-role-policy \
  --role-name paperclip-ecs-execution \
  --policy-name SecretsAccess \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["secretsmanager:GetSecretValue"],
      "Resource": "arn:aws:secretsmanager:'$AWS_REGION':'$AWS_ACCOUNT_ID':secret:paperclip/*"
    }]
  }'

# Task role（应用角色——按需添加权限）
aws iam create-role \
  --role-name paperclip-ecs-task \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ecs-tasks.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'
```

<a id="8-ecs-cluster-and-task-definition"></a>

## 8. ECS 集群与任务定义

```bash
aws ecs create-cluster --cluster-name paperclip

aws logs create-log-group --log-group-name /ecs/paperclip
```

使用 `docker/ecs-task-definition.json` 中的模板注册任务定义。注册前，先替换占位值：

```bash
sed -e "s|<ACCOUNT_ID>|$AWS_ACCOUNT_ID|g" \
    -e "s|<REGION>|$AWS_REGION|g" \
    -e "s|<EFS_ID>|$EFS_ID|g" \
    -e "s|<DOMAIN>|$PAPERCLIP_DOMAIN|g" \
    docker/ecs-task-definition.json > /tmp/paperclip-task-def.json

aws ecs register-task-definition \
  --cli-input-json file:///tmp/paperclip-task-def.json
```

<a id="9-alb-and-tls-certificate"></a>

## 9. ALB 与 TLS 证书

申请证书（必须通过 DNS 验证）：

```bash
CERT_ARN=$(aws acm request-certificate \
  --domain-name $PAPERCLIP_DOMAIN \
  --validation-method DNS \
  --query 'CertificateArn' --output text)

# 获取需要添加到 DNS 的 CNAME 记录
aws acm describe-certificate \
  --certificate-arn $CERT_ARN \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord'
```

将 CNAME 添加到 DNS 服务商，然后等待验证通过：

```bash
aws acm wait certificate-validated --certificate-arn $CERT_ARN
```

创建 ALB：

```bash
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name paperclip-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $ALB_SG \
  --scheme internet-facing \
  --type application \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query 'LoadBalancers[0].DNSName' --output text)

# Target group
TG_ARN=$(aws elbv2 create-target-group \
  --name paperclip-tg \
  --protocol HTTP \
  --port 3100 \
  --vpc-id $VPC_ID \
  --target-type ip \
  --health-check-path /api/health \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query 'TargetGroups[0].TargetGroupArn' --output text)

# HTTPS listener
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTPS \
  --port 443 \
  --certificates CertificateArn=$CERT_ARN \
  --default-actions Type=forward,TargetGroupArn=$TG_ARN \
  --query 'Listeners[0].ListenerArn' --output text)

# HTTP listener——将所有 :80 流量重定向到 :443
HTTP_LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP \
  --port 80 \
  --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
  --query 'Listeners[0].ListenerArn' --output text)
```

将 DNS 指向 ALB：
- 为 `$PAPERCLIP_DOMAIN` 创建 CNAME 或 ALIAS 记录，指向 `$ALB_DNS`

<a id="10-create-ecs-service"></a>

## 10. 创建 ECS 服务

```bash
aws ecs create-service \
  --cluster paperclip \
  --service-name paperclip-server \
  --task-definition paperclip-server \
  --desired-count 1 \
  --launch-type FARGATE \
  --deployment-configuration '{
    "deploymentCircuitBreaker": {"enable": true, "rollback": true},
    "maximumPercent": 200,
    "minimumHealthyPercent": 100
  }' \
  --network-configuration '{
    "awsvpcConfiguration": {
      "subnets": ["'$SUBNET_1'", "'$SUBNET_2'"],
      "securityGroups": ["'$ECS_SG'"],
      "assignPublicIp": "ENABLED"
    }
  }' \
  --load-balancers '[{
    "targetGroupArn": "'$TG_ARN'",
    "containerName": "paperclip-server",
    "containerPort": 3100
  }]'
```

> **注意：**使用没有 NAT Gateway 的公有子网时，需要设置 `assignPublicIp: ENABLED`。如果使用私有子网，请设为 `DISABLED`，并确保已配置 NAT Gateway 以访问外网。

<a id="11-verify-deployment"></a>

## 11. 验证部署

```bash
# 观察 task 启动
aws ecs describe-services \
  --cluster paperclip \
  --services paperclip-server \
  --query 'services[0].{desired:desiredCount,running:runningCount,status:status}'

# 检查 task 健康状态
aws ecs list-tasks --cluster paperclip --service-name paperclip-server
TASK_ARN=$(aws ecs list-tasks --cluster paperclip --service-name paperclip-server --query 'taskArns[0]' --output text)
aws ecs describe-tasks --cluster paperclip --tasks $TASK_ARN \
  --query 'tasks[0].{status:lastStatus,health:healthStatus}'

# 检查日志
aws logs tail /ecs/paperclip --since 10m --follow

# 请求健康检查 endpoint
curl -sf https://$PAPERCLIP_DOMAIN/api/health
```

**健康状态标志：**
- ECS task 状态为 `RUNNING`，健康状态为 `HEALTHY`
- 日志显示 `plugin job coordinator started` 和 `plugin-loader: loadAll complete`
- `/api/health` 返回 200

<a id="post-deploy-security-hardening"></a>

## 部署后安全加固

首位用户注册后会获得管理员角色。此后应锁定实例：

```bash
# 禁用公开注册（防止未授权用户创建账户）
# 添加到任务定义的 environment 部分，然后重新部署：
#   { "name": "PAPERCLIP_AUTH_DISABLE_SIGN_UP", "value": "true" }

# 或通过 Secrets Manager / task 定义覆盖项更新，然后强制重新部署
aws ecs update-service \
  --cluster paperclip \
  --service paperclip-server \
  --force-new-deployment
```

禁用注册后，可通过邀请流程（v2026.416.0 引入）向其他用户授予访问权限。

<a id="deploying-updates"></a>

## 部署更新

构建并推送镜像，然后强制启动新部署：

```bash
# 构建并推送新镜像
docker build -t paperclip-server .
docker tag paperclip-server:latest \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/paperclip-server:latest
docker push \
  $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/paperclip-server:latest

# 发布
aws ecs update-service \
  --cluster paperclip \
  --service paperclip-server \
  --force-new-deployment

# 观察部署状态
aws ecs describe-services \
  --cluster paperclip \
  --services paperclip-server \
  --query 'services[0].deployments[*].{status:status,running:runningCount,desired:desiredCount,rollout:rolloutState}'
```

ECS 会执行滚动更新：启动新 task，等待其通过健康检查，然后停止旧 task。

<a id="rollback"></a>

## 回滚

如果新部署不健康：

```bash
# 如果新 task 未通过健康检查，ECS 会自动回滚
#（上文的服务配置中已启用 circuit breaker）。
# 如需手动强制回滚：

# 1. 查找之前的 task definition revision
aws ecs list-task-definitions \
  --family-prefix paperclip-server \
  --sort DESC \
  --query 'taskDefinitionArns[0:3]'

# 2. 将服务更新到之前的 revision
aws ecs update-service \
  --cluster paperclip \
  --service paperclip-server \
  --task-definition paperclip-server:<PREVIOUS_REVISION>
```

<a id="scaling-to-zero-cost-savings"></a>

## 缩容到零（节省成本）

不使用时可缩容：

```bash
# 停止
aws ecs update-service \
  --cluster paperclip \
  --service paperclip-server \
  --desired-count 0

# 启动
aws ecs update-service \
  --cluster paperclip \
  --service paperclip-server \
  --desired-count 1
```

也可以停止 RDS（7 天后会自动重启）：

```bash
aws rds stop-db-instance --db-instance-identifier paperclip-db
aws rds start-db-instance --db-instance-identifier paperclip-db
```

<a id="teardown"></a>

## 拆除部署

按相反顺序删除所有资源：

```bash
# 1. ECS service 和 cluster
aws ecs update-service --cluster paperclip --service paperclip-server --desired-count 0
aws ecs delete-service --cluster paperclip --service paperclip-server --force
aws ecs delete-cluster --cluster paperclip

# 2. ALB 和 ACM 证书
aws elbv2 delete-listener --listener-arn $HTTP_LISTENER_ARN
aws elbv2 delete-listener --listener-arn $LISTENER_ARN
aws elbv2 delete-target-group --target-group-arn $TG_ARN
aws elbv2 delete-load-balancer --load-balancer-arn $ALB_ARN
aws acm delete-certificate --certificate-arn $CERT_ARN

# 3. RDS（创建最终快照）
aws rds delete-db-instance \
  --db-instance-identifier paperclip-db \
  --final-db-snapshot-identifier paperclip-db-final
aws rds wait db-instance-deleted --db-instance-identifier paperclip-db
aws rds delete-db-subnet-group --db-subnet-group-name paperclip-db-subnet

# 4. EFS（必须先删除 mount target）
for MT in $(aws efs describe-mount-targets --file-system-id $EFS_ID --query 'MountTargets[*].MountTargetId' --output text); do
  aws efs delete-mount-target --mount-target-id $MT
done
# Mount target 删除是异步操作；删除文件系统前应轮询，直到不再有 mount target，
# 否则 delete-file-system 会因 FileSystemInUse 而失败。
echo "Waiting for mount targets to delete..."
while aws efs describe-mount-targets \
  --file-system-id $EFS_ID \
  --query 'MountTargets[0].MountTargetId' --output text 2>/dev/null | grep -q 'fsmt-'; do
  sleep 5
done
aws efs delete-file-system --file-system-id $EFS_ID

# 5. 密钥
for s in database-url anthropic-api-key better-auth-secret openai-api-key github-token; do
  aws secretsmanager delete-secret --secret-id paperclip/$s --force-delete-without-recovery
done

# 6. 安全组（所有依赖项删除后）
for sg in $EFS_SG $RDS_SG $ECS_SG $ALB_SG; do
  aws ec2 delete-security-group --group-id $sg
done

# 7. ECR
aws ecr delete-repository --repository-name paperclip-server --force

# 8. IAM 角色
aws iam delete-role-policy --role-name paperclip-ecs-execution --policy-name SecretsAccess
aws iam detach-role-policy --role-name paperclip-ecs-execution \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
aws iam delete-role --role-name paperclip-ecs-execution
aws iam delete-role --role-name paperclip-ecs-task

# 9. 日志组
aws logs delete-log-group --log-group-name /ecs/paperclip
```

<a id="cost-reference"></a>

## 成本参考

| 服务 | 配置 | 月费用 |
|---------|--------|---------|
| ECS Fargate | 2 vCPU, 4 GB, 24/7 | ~$70 |
| RDS Postgres | db.t4g.micro, 20 GB | ~$15 |
| ALB | 1 LCU average | ~$22 |
| NAT Gateway | 1 AZ (if using private subnets) | ~$35 |
| EFS | 1 GB Standard | ~$0.30 |
| Secrets Manager | 5 secrets | ~$2 |
| CloudWatch Logs | ~1 GB/mo | ~$0.50 |
| ECR | ~1 GB | ~$0.10 |
| **Total (public subnets, no NAT)** | | **~$110/mo** |
| **Total (private subnets + NAT)** | | **~$145/mo** |

使用 Fargate Spot，并设置计划在非工作时段缩容到 0，可将费用降至约每月 $60–85。
