import { useEffect } from "react";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { ReviewQueueCard } from "./ReviewQueueCard";
import { useTranslation } from "@/i18n";

/**
 * Review — the "decisions waiting on you" inbox (PAP-12371, Finding B).
 *
 * Ask-first approvals used to live only inside the "Needs attention" page,
 * folded together with health/error triage. That buried the one thing a user
 * must act on for their agents to proceed. This is the explicit, top-level
 * home for those approvals, aligned with the Inbox "waiting for your OK"
 * language from the approved PAP-11178 gateway UX. Health issues stay on
 * "Needs attention"; decisions live here.
 */
export function AppsReview() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: t("ui.connectors"), href: "/apps" },
      { label: t("ui.review") },
    ]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) {
    return <div className="p-6 text-sm text-muted-foreground">{t("ui.selectOrganization")}</div>;
  }

  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{t("ui.review")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("ui.reviewDescription")}
        </p>
      </header>

      <ReviewQueueCard emptyState="reassure" heading={t("ui.waitingForOk")} />
    </div>
  );
}
