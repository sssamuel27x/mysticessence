export const MAX_NEWSLETTER_CAMPAIGN_IMAGES = 3;
export const MAX_NEWSLETTER_CAMPAIGN_IMAGE_BYTES = 5 * 1024 * 1024;

export type NewsletterCampaignImage = {
  id: string;
  name: string;
  dataUrl: string;
};

export type NewsletterCampaignDraft = {
  recipient: string;
  subject: string;
  message: string;
  images: NewsletterCampaignImage[];
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function validateNewsletterCampaignImages(files: Array<Pick<File, "type" | "size">>, currentCount: number) {
  if (currentCount + files.length > MAX_NEWSLETTER_CAMPAIGN_IMAGES) return "count";
  if (files.some((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type))) return "type";
  if (files.some((file) => file.size <= 0 || file.size > MAX_NEWSLETTER_CAMPAIGN_IMAGE_BYTES)) return "size";
  return null;
}

export function validateNewsletterCampaignDraft(draft: NewsletterCampaignDraft) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.recipient.trim())) return "recipient";
  if (!draft.subject.trim() || draft.subject.trim().length > 140) return "subject";
  if (!draft.message.trim() || draft.message.trim().length > 5000) return "message";
  return null;
}

export function buildNewsletterCampaignHtml(draft: Pick<NewsletterCampaignDraft, "subject" | "message" | "images">) {
  const subject = escapeHtml(draft.subject.trim() || "A sua novidade Mystic Essence");
  const paragraphs = (draft.message.trim() || "Escreva aqui a mensagem da newsletter.")
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 18px;color:#d5cec2;font-size:16px;line-height:1.75">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`)
    .join("");
  const images = draft.images.map((image) => `<img src="${escapeHtml(image.dataUrl)}" alt="" style="display:block;width:100%;height:auto;margin:22px 0;border:1px solid #4b3a17">`).join("");

  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#050504;color:#f5efe3;font-family:Arial,sans-serif"><div style="max-width:680px;margin:auto;padding:34px 18px"><div style="border:1px solid #8d691e;background:#0d0c09;padding:34px"><p style="margin:0 0 10px;color:#ddb64e;font-size:12px;letter-spacing:2px;text-transform:uppercase">Mystic Essence · Newsletter</p><h1 style="margin:0 0 22px;font-family:Georgia,serif;font-size:34px;line-height:1.15;font-weight:400;color:#f8e8b2">${subject}</h1>${images}${paragraphs}<p style="margin:28px 0 0"><a href="https://mysticessence.pt" style="display:inline-block;padding:14px 22px;background:#d5a52e;color:#090806;text-decoration:none;font-weight:700">Descobrir na Mystic Essence</a></p><p style="margin:30px 0 0;padding-top:20px;border-top:1px solid #3b311d;color:#8f877b;font-size:12px;line-height:1.6">Mystic Essence · Santa Maria da Feira · +351 938 258 798<br><span style="color:#6f685e">Recebeu esta mensagem porque subscreveu a newsletter. A mensagem enviada inclui uma ligação para cancelar a subscrição.</span></p></div></div></body></html>`;
}
