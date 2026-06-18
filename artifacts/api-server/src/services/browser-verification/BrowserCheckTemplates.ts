/**
 * Pre-built browser check templates for the most common compliance controls.
 * These templates provide ready-made URL and instruction definitions that
 * administrators can apply to any control with one click.
 */

export interface BrowserCheckTemplate {
  id: string;
  name: string;
  description: string;
  category: "DevSecOps" | "Identity" | "Cloud" | "Network" | "Data";
  frameworks: string[];
  url: string;
  instruction: string;
  scheduleCron: string;
}

export const BROWSER_CHECK_TEMPLATES: BrowserCheckTemplate[] = [
  {
    id: "github-branch-protection",
    name: "GitHub Branch Protection",
    description: "Verifies that the default branch has protection rules enabled on a public GitHub repository.",
    category: "DevSecOps",
    frameworks: ["SOC 2", "ISO 27001"],
    url: "https://github.com",
    instruction: "Confirm that branch protection is enabled on the main branch — look for branch protection rules that require pull request reviews before merging.",
    scheduleCron: "0 8 * * *",
  },
  {
    id: "ssl-certificate-validity",
    name: "SSL Certificate Validity",
    description: "Checks that a public URL returns a valid TLS certificate and the connection is secure.",
    category: "Network",
    frameworks: ["ISO 27001", "PCI DSS"],
    url: "https://badssl.com/",
    instruction: "Verify the SSL certificate is valid, not expired, and the page shows a secure connection indicator. Confirm no certificate warning is displayed.",
    scheduleCron: "0 6 * * *",
  },
  {
    id: "okta-mfa-enforcement",
    name: "Okta MFA Enforcement",
    description: "Checks that Okta's public status or documentation confirms MFA enforcement is available.",
    category: "Identity",
    frameworks: ["ISO 27001", "SOC 2", "NIST CSF"],
    url: "https://trust.okta.com/",
    instruction: "Verify the Okta trust page is accessible and shows no active incidents affecting MFA or authentication services. Confirm the status is operational.",
    scheduleCron: "0 9 * * 1",
  },
  {
    id: "google-workspace-2fa",
    name: "Google Workspace 2-Step Verification",
    description: "Verifies Google Workspace 2FA enforcement documentation and status.",
    category: "Identity",
    frameworks: ["ISO 27001", "SOC 2", "GDPR"],
    url: "https://workspace.google.com/intl/en/features/security/",
    instruction: "Confirm the Google Workspace security page mentions 2-step verification or multi-factor authentication enforcement capabilities. Verify the page is accessible.",
    scheduleCron: "0 9 * * 1",
  },
  {
    id: "s3-public-access-block",
    name: "AWS S3 Public Access Block",
    description: "Verifies the AWS documentation page for S3 Public Access Block settings is accessible and describes the feature.",
    category: "Cloud",
    frameworks: ["ISO 27001", "SOC 2", "PCI DSS"],
    url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html",
    instruction: "Confirm the AWS S3 documentation describes the Public Access Block feature. Verify the page contains information about blocking public access to S3 buckets.",
    scheduleCron: "0 8 * * *",
  },
  {
    id: "cloudtrail-logging",
    name: "AWS CloudTrail Logging Status",
    description: "Verifies CloudTrail documentation is accessible and confirms logging capabilities.",
    category: "Cloud",
    frameworks: ["SOC 2", "PCI DSS", "ISO 27001"],
    url: "https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-getting-started.html",
    instruction: "Confirm the AWS CloudTrail documentation page is accessible and describes logging API activity. Verify the page contains information about enabling CloudTrail trails.",
    scheduleCron: "0 8 * * *",
  },
];

export function getTemplateById(id: string): BrowserCheckTemplate | undefined {
  return BROWSER_CHECK_TEMPLATES.find(t => t.id === id);
}
