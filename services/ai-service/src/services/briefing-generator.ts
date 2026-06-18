import { openai } from "@workspace/integrations-openai-ai-server";

export function buildGrcSystemPrompt(context?: string): string {
  const base = `You are DuFense AI vCISO — an enterprise-grade virtual Chief Information Security Officer powered by advanced AI. You have deep expertise in:
- ISO 27001/27002, NIST CSF/800-53, SOC 2, PCI DSS, GDPR, HIPAA, CCPA, CIS Controls
- Threat intelligence, vulnerability management, incident response
- Risk quantification (FAIR model), security program roadmap development
- Executive communication, board reporting, and regulatory compliance

You provide authoritative, actionable guidance. Every response includes:
1. A clear, structured answer
2. Specific, prioritized recommendations
3. Regulatory/framework citations where relevant
4. Confidence level and key assumptions

Be direct, professional, and decisive. You are the CISO's trusted advisor.`;
  if (context) return `${base}\n\nCurrent platform context:\n${context}`;
  return base;
}

const BRIEFING_USER_PROMPT = (period: string) =>
  `Generate a board-ready executive security briefing for ${period}. Structure it with these sections (use ## headers):

## Executive Summary
## Current Risk Posture
## Key Security Metrics
## Critical Findings & Remediation Status
## Compliance & Regulatory Status
## Security Investments & ROI
## 30-60-90 Day Action Plan
## Board Recommendations

Be specific, use quantified metrics, reference real frameworks. Professional tone suitable for board presentation.`;

export { BRIEFING_USER_PROMPT };

export async function generateBriefingText(period: string, context?: string): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: buildGrcSystemPrompt(context) },
      { role: "user", content: BRIEFING_USER_PROMPT(period) },
    ],
  });
  return completion.choices[0]?.message?.content ?? "(No briefing content generated)";
}

const SLACK_WEBHOOK_ALLOW_HOSTS = ["hooks.slack.com"];

export function validateSlackWebhookUrl(url: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "Slack webhook URL must use HTTPS" };
  }
  if (!SLACK_WEBHOOK_ALLOW_HOSTS.includes(parsed.hostname)) {
    return { valid: false, reason: `Slack webhook host must be one of: ${SLACK_WEBHOOK_ALLOW_HOSTS.join(", ")}` };
  }
  return { valid: true };
}

export async function sendViaSlack(webhookUrl: string, text: string, period: string): Promise<void> {
  const validation = validateSlackWebhookUrl(webhookUrl);
  if (!validation.valid) {
    throw new Error(`Invalid Slack webhook URL: ${validation.reason}`);
  }

  const payload = {
    text: `*DuFense AI Security Briefing — ${period}*`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*DuFense AI vCISO Security Briefing*\n_Period: ${period}_`,
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: text.slice(0, 2900),
        },
      },
      ...(text.length > 2900
        ? [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `_[Briefing truncated — log into DuFense to view the full report]_`,
              },
            },
          ]
        : []),
    ],
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook returned ${response.status}: ${await response.text()}`);
  }
}

export async function sendViaEmail(toEmail: string, text: string, period: string): Promise<void> {
  const apiKey = process.env["SENDGRID_API_KEY"];
  if (!apiKey) {
    throw new Error("SENDGRID_API_KEY is not configured — email delivery unavailable");
  }

  const htmlBody = `<html><body style="font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#1e293b;">
<h1 style="color:#1E3A5F;border-bottom:2px solid #1E3A5F;padding-bottom:12px;">
  DuFense AI vCISO Security Briefing
</h1>
<p style="color:#64748b;font-size:14px;">Period: ${period}</p>
${text
  .split("\n")
  .map((line) => {
    if (line.startsWith("## ")) return `<h2 style="color:#1E3A5F;margin-top:28px;">${line.slice(3)}</h2>`;
    if (line.startsWith("# ")) return `<h1 style="color:#1E3A5F;">${line.slice(2)}</h1>`;
    if (line.startsWith("- ")) return `<li style="margin:4px 0;">${line.slice(2)}</li>`;
    if (line.trim() === "") return "<br/>";
    return `<p style="margin:6px 0;line-height:1.6;">${line}</p>`;
  })
  .join("\n")}
<hr style="margin:32px 0;border-color:#e2e8f0;"/>
<p style="font-size:12px;color:#94a3b8;">Delivered by DuFense GRC Platform · AI-powered security intelligence</p>
</body></html>`;

  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: process.env["SENDGRID_FROM_EMAIL"] ?? "noreply@dufense.io", name: "DuFense AI vCISO" },
    subject: `AI Security Briefing — ${period}`,
    content: [
      { type: "text/plain", value: text },
      { type: "text/html", value: htmlBody },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid returned ${response.status}: ${body}`);
  }
}
