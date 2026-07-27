import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Policy to Action",
  description:
    "How Policy to Action collects, uses, protects, and deletes information for school district workspaces.",
};

const APP_ROUTE = "/policy-assistant" as Route;

export default function PrivacyPage() {
  return (
    <div className="pta-landing">
      <header className="pta-nav">
        <Link className="pta-brand" href="/">
          <span className="pta-brand-chip">
            <Image src="/logo-icon.png" alt="" width={40} height={34} />
          </span>
          <span className="pta-brand-word">Policy to Action</span>
        </Link>
        <nav className="pta-nav-links" aria-label="Privacy navigation">
          <Link className="pta-button pta-button-ghost" href={APP_ROUTE}>
            Sign in
          </Link>
        </nav>
      </header>

      <main className="pta-legal">
        <h1>Privacy Policy</h1>
        <p className="pta-legal-date">Effective July 27, 2026</p>

        <p>
          Policy to Action is a decision-support platform for school district administrators,
          operated by Scarlet Fire LLC. It answers scenario questions using only the board
          policies and handbooks a district uploads to its own workspace, with citations to the
          source text. This policy explains what information the platform collects, how it is
          used, and the controls you have over it.
        </p>

        <h2>Information we collect</h2>
        <p>
          Account information: your first and last name, work email address, district name, and,
          if you choose to provide them, your role title and professional context. These
          personalize the platform and tailor guidance to your role.
        </p>
        <p>
          Workspace content: the policy documents and handbooks your district uploads, the
          scenario questions you ask, the answers generated, and the answers you pin. This
          content exists so the platform can do its job; it belongs to your district.
        </p>
        <p>
          Operational records: authentication sessions, and an audit log of each model request
          made on your behalf, kept so that platform activity can be reviewed and accounted for.
        </p>
        <p>
          We do not collect advertising identifiers, we do not track you across other apps or
          websites, and the platform contains no advertising or analytics trackers.
        </p>

        <h2>How information is used</h2>
        <p>
          Your information is used solely to operate the platform: to authenticate you, to
          retrieve the policy passages relevant to your question, to generate cited guidance, to
          send transactional email such as verification and password reset messages, and to
          maintain the security of your workspace. It is never sold, rented, or used for
          advertising.
        </p>

        <h2>Service providers</h2>
        <p>
          The platform runs on a small set of infrastructure providers, each bound by its own
          data protection terms: Vercel hosts the application, Neon hosts the database, Resend
          delivers transactional email, and OpenAI processes text to generate answers under an
          executed Data Processing Agreement. OpenAI does not use your content to train its
          models. A fuller description of the architecture is available in the Technical
          Blueprint linked from our home page.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Your content remains in your workspace until you remove it. You can export your
          conversations, pins, and account data at any time from Settings, and you can delete
          your account entirely from the same place, which permanently removes your account and
          its content from the platform. Uploaded policy documents can be archived or removed
          from the Library by your district&rsquo;s designated administrator.
        </p>

        <h2>Security</h2>
        <p>
          All traffic is encrypted in transit with TLS, data is encrypted at rest by our hosting
          providers, passwords are stored only as salted hashes, and sessions can be revoked
          from Settings, including a control to sign out every other device.
        </p>

        <h2>Students and children</h2>
        <p>
          Policy to Action is a professional tool for adult school administrators and is not
          directed at children. We encourage users to describe scenarios using placeholders such
          as Student A rather than real student names, and the platform reminds users to do so.
        </p>

        <h2>Your choices and contact</h2>
        <p>
          Questions, requests, or concerns about this policy or your data can be sent to
          Scarlet Fire LLC at jbeauscott@gmail.com. If we make material changes to this policy,
          the effective date above will be updated.
        </p>

        <p className="pta-legal-note">
          Guidance produced by the platform is decision support, not legal advice. Verify
          consequential decisions against the cited source text and your district&rsquo;s
          counsel.
        </p>
      </main>

      <footer className="pta-footer">
        <span className="pta-brand">
          <span className="pta-brand-chip is-small">
            <Image src="/logo-icon.png" alt="" width={26} height={22} />
          </span>
          <span className="pta-brand-word">Policy to Action</span>
        </span>
        <p>A Scarlet Fire LLC product.</p>
      </footer>
    </div>
  );
}
