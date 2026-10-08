import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pc from "picocolors";
import { resolvePublishedVersion, type CommandRunner } from "./install.js";
import { packageVersion } from "../version.js";

const execFileAsync = promisify(execFile);

const defaultRunCommand: CommandRunner = (command, args, options) =>
  execFileAsync(command, args, { ...options, encoding: "utf8" });

export type ChannelName = "stable" | "beta" | "nightly" | "canary";

export type ChannelDescriptor = {
  channel: ChannelName;
  distTag: string;
  cadence: string;
  audience: string;
};

// Ordered from most to least stable — the order users should consider them.
export const RELEASE_CHANNELS: readonly ChannelDescriptor[] = [
  {
    channel: "stable",
    distTag: "latest",
    cadence: "manual, soaked in beta for 3+ days",
    audience: "the recommended release for almost everyone",
  },
  {
    channel: "beta",
    distTag: "beta",
    cadence: "manual promotion behind an approval gate",
    audience: "release candidates: what stable becomes a few days later",
  },
  {
    channel: "nightly",
    distTag: "nightly",
    cadence: "once a night, smoke-gated",
    audience: "yesterday's merges, tested as a unit",
  },
  {
    channel: "canary",
    distTag: "canary",
    cadence: "every merge to master",
    audience: "the bleeding edge",
  },
];

const CALVER_RE = /^\d{4}\.\d{1,4}\.\d+$/;
const PRERELEASE_RE = /^\d{4}\.\d{1,4}\.\d+-(canary|nightly|beta)\.\d+$/;

// Published versions carry their lane in the version string; the source
// checkout's package.json holds a placeholder that matches neither form.
export function channelForVersion(version: string): ChannelName | "unknown" {
  const prerelease = version.match(PRERELEASE_RE);
  if (prerelease) return prerelease[1] as ChannelName;
  if (CALVER_RE.test(version)) return "stable";
  return "unknown";
}

export type ChannelState = ChannelDescriptor & { version: string | null };

export async function collectChannelState(
  runCommand: CommandRunner = defaultRunCommand,
): Promise<ChannelState[]> {
  const resolved = await Promise.allSettled(
    RELEASE_CHANNELS.map((entry) => resolvePublishedVersion(entry.distTag, runCommand)),
  );
  return RELEASE_CHANNELS.map((entry, index) => {
    const outcome = resolved[index];
    return {
      ...entry,
      version: outcome.status === "fulfilled" ? outcome.value : null,
    };
  });
}

export type ChannelsOptions = { json?: boolean };

export async function channelsCommand(
  options: ChannelsOptions = {},
  runCommand: CommandRunner = defaultRunCommand,
): Promise<void> {
  const state = await collectChannelState(runCommand);
  const currentChannel = channelForVersion(packageVersion);

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          current: { version: packageVersion, channel: currentChannel },
          channels: state,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(pc.bold("Paperclip 发布通道"));
  console.log("");
  for (const entry of state) {
    const version = entry.version ?? pc.yellow("不可用");
    console.log(`  ${pc.bold(entry.channel.padEnd(8))} ${version}`);
    console.log(`  ${" ".repeat(8)} ${pc.dim(`${entry.cadence} — ${entry.audience}`)}`);
    console.log(`  ${" ".repeat(8)} ${pc.dim(`npx paperclipai@${entry.distTag} onboard`)}`);
    console.log("");
  }

  if (currentChannel === "unknown") {
    console.log(
      `此安装的版本为 ${pc.bold(packageVersion)}，不对应任何已发布通道（源码检出会显示仓库占位版本）。`,
    );
  } else {
    console.log(`此安装的版本为 ${pc.bold(packageVersion)}，通道为 ${pc.bold(currentChannel)}。`);
  }
  console.log(`Docker 镜像使用相同名称：ghcr.io/paperclipai/paperclip:{latest,beta,nightly,canary}`);
}
