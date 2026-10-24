import "server-only";

type Mail = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Pluggable mailer. When EMAIL_API_KEY is set, sends through a Resend-compatible
 * HTTP API. Without it (local development, or a deploy before the key is
 * configured), the message is printed to the server log so sign-up and reset
 * links are still reachable.
 */
export async function sendMail({ to, subject, text }: Mail): Promise<void> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM || "DocuMind <onboarding@resend.dev>";

  if (apiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      console.error("[mail] provider rejected message:", await res.text());
      throw new Error("Could not send the email. Try again in a moment.");
    }
    return;
  }

  console.log(`[mail:preview] to=${to}\nsubject=${subject}\n${text}`);
}
