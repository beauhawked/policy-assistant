import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Policy to Action — Defensible, policy-grounded decision support for school districts",
  description:
    "Describe a real administrative scenario and get structured guidance built exclusively from your district's own board policies and handbooks, with every claim cited to its source.",
};

const APP_ROUTE = "/policy-assistant" as Route;

export default function LandingPage() {
  return (
    <div className="pta-landing">
      <header className="pta-nav">
        <span className="pta-brand">
          <span className="pta-brand-chip">
            <Image src="/logo-icon.png" alt="" width={40} height={34} />
          </span>
          <span className="pta-brand-word">Policy to Action</span>
        </span>
        <nav className="pta-nav-links" aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#resources">Resources</a>
          <Link className="pta-button pta-button-ghost" href={APP_ROUTE}>
            Sign in
          </Link>
          <Link className="pta-button pta-button-primary" href={APP_ROUTE}>
            Open the app
          </Link>
        </nav>
      </header>

      <main>
        <section className="pta-hero">
          <div className="pta-hero-copy">
            <h1>
              Every answer, grounded in your district&rsquo;s <em>own</em> policies.
            </h1>
            <p>
              Policy to Action is decision support for school administrators. Describe a real
              scenario in plain language and receive structured, citation-backed guidance built
              exclusively from your district&rsquo;s board policies and handbooks, with the exact
              source text one click from every claim.
            </p>
            <div className="pta-hero-actions">
              <Link className="pta-button pta-button-primary pta-button-large" href={APP_ROUTE}>
                Create your workspace
              </Link>
              <Link className="pta-button pta-button-ghost pta-button-large" href={APP_ROUTE}>
                Sign in
              </Link>
            </div>
            <p className="pta-hero-note">
              Private to your district. Sources cited on every answer. Not legal advice.
            </p>
          </div>
          <figure className="pta-hero-shot">
            <Image
              src="/landing/answer.jpg"
              alt="A Policy to Action answer showing cited policy summaries and numbered recommended actions"
              width={1208}
              height={729}
              priority
            />
          </figure>
        </section>

        <section className="pta-features" aria-label="What Policy to Action does">
          <div className="pta-feature">
            <h2>Answers with receipts</h2>
            <p>
              Each answer names the policies that apply, lists numbered recommended actions, and
              spells out the implications, with a citation chip for every source used.
            </p>
          </div>
          <div className="pta-feature">
            <h2>Evidence, one click away</h2>
            <p>
              The evidence panel quotes the exact policy language behind each claim, so you verify
              against the governing text before you act. Defensibility is the default.
            </p>
          </div>
          <div className="pta-feature">
            <h2>Your sources, your control</h2>
            <p>
              Import board policies straight from your policy site or a spreadsheet, upload
              handbooks, and manage everything in a searchable library your district owns.
            </p>
          </div>
        </section>

        <section className="pta-how" id="how-it-works">
          <h2>How it works</h2>
          <ol>
            <li>
              <b>Add your sources once.</b> A designated administrator imports the board policy
              manual and uploads the student and staff handbooks. Most districts finish in under
              twenty minutes.
            </li>
            <li>
              <b>Ask real scenarios.</b> A student altercation involving an IEP. A records
              request. A staff leave question. Multi-part situations are handled issue by issue,
              tailored to your role.
            </li>
            <li>
              <b>Verify and keep.</b> Check the cited source in the evidence panel, pin answers
              worth keeping, and print clean copies for board packets.
            </li>
          </ol>
          <figure className="pta-how-shot">
            <Image
              src="/landing/evidence.jpg"
              alt="The evidence panel showing the exact quoted policy text behind an answer"
              width={1208}
              height={729}
            />
            <figcaption>The evidence panel: the exact source text behind every claim.</figcaption>
          </figure>
        </section>

        <section className="pta-resources" id="resources">
          <h2>Resources</h2>
          <p>
            For administrators, setup leads, and district technology teams evaluating the
            platform:
          </p>
          <ul>
            <li>
              <a href="/help/Policy-to-Action-Quick-Start-Participants.pdf">Quick-Start Guide (PDF)</a>
            </li>
            <li>
              <a href="/help/Policy-to-Action-District-Setup-Guide.pdf">District Setup Guide (PDF)</a>
            </li>
            <li>
              <a href="/help/Policy-to-Action-User-Manual.pdf">User Manual (PDF)</a>
            </li>
            <li>
              <a href="/help/Policy-to-Action-Technical-Blueprint.pdf">
                Technical Blueprint for District IT (PDF)
              </a>
            </li>
          </ul>
        </section>
      </main>

      <footer className="pta-footer">
        <span className="pta-brand">
          <span className="pta-brand-chip is-small">
            <Image src="/logo-icon.png" alt="" width={26} height={22} />
          </span>
          <span className="pta-brand-word">Policy to Action</span>
        </span>
        <p>
          A Scarlet Fire LLC product. Guidance is generated from your district&rsquo;s uploaded
          policies and is not legal advice; verify critical decisions against the cited source.
        </p>
      </footer>
    </div>
  );
}
