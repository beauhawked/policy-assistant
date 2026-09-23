import type { Metadata, Route } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Policy Aligned — Policy-grounded decision support for school districts",
  description:
    "Turn district policy into defensible next steps with structured guidance grounded in your district's own board policies and handbooks.",
};

const APP_ROUTE = "/policy-assistant" as Route;

const resources = [
  {
    href: "/help/Policy-to-Action-Quick-Start-Participants.pdf",
    title: "Participant quick start",
    description: "A concise guide for administrators using an established district workspace.",
  },
  {
    href: "/help/Policy-to-Action-District-Setup-Guide.pdf",
    title: "District setup guide",
    description: "Prepare the workspace, import policies, and add student and staff handbooks.",
  },
  {
    href: "/help/Policy-to-Action-User-Manual.pdf",
    title: "Complete user manual",
    description: "Detailed guidance for scenarios, evidence review, saved work, and settings.",
  },
  {
    href: "/help/Policy-to-Action-Technical-Blueprint.pdf",
    title: "Technical blueprint",
    description: "Architecture, privacy, and implementation information for district technology teams.",
  },
] as const;

export default function LandingPage() {
  return (
    <div className="pta-landing">
      <header className="pta-nav">
        <Link className="pta-brand" href={"/" as Route} aria-label="Policy Aligned home">
          <span className="pta-brand-chip">
            <Image src="/logo-icon.png" alt="" width={40} height={34} priority />
          </span>
          <span className="pta-brand-word">Policy Aligned</span>
        </Link>

        <nav className="pta-nav-links" aria-label="Landing navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#district-ready">District readiness</a>
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
            <p className="pta-eyebrow">Policy-grounded decision support</p>
            <h1>
              Turn district policy into <em>defensible</em> next steps.
            </h1>
            <p className="pta-hero-lede">
              Describe a real administrative scenario. Policy Aligned retrieves the governing
              language, shows the evidence, and builds a structured action plan you can verify
              before you act.
            </p>
            <div className="pta-hero-actions">
              <Link className="pta-button pta-button-primary pta-button-large" href={APP_ROUTE}>
                Create your district workspace
              </Link>
              <a className="pta-button pta-button-ghost pta-button-large" href="#how-it-works">
                See how it works
              </a>
            </div>
            <p className="pta-hero-note">
              Private to your district. Every answer cites its sources. Human judgment stays in
              control.
            </p>
          </div>

          <figure className="pta-hero-shot">
            <span className="pta-shot-label">District evidence</span>
            <span className="pta-shot-frame">
              <Image
                src="/landing/evidence.jpg"
                alt="A Policy Aligned answer beside the exact district policy language used as evidence"
                width={1208}
                height={729}
                priority
              />
            </span>
            <figcaption>The recommendation and its governing source stay together.</figcaption>
          </figure>
        </section>

        <section className="pta-proof" aria-label="Policy Aligned benefits">
          <article>
            <h2>The source stays visible.</h2>
            <p>Exact policy language sits beside the recommendation, ready for review.</p>
          </article>
          <article>
            <h2>Built for real scenarios.</h2>
            <p>Ask multi-part questions in plain language and handle each issue deliberately.</p>
          </article>
          <article>
            <h2>Private for each user.</h2>
            <p>Each workspace uses its own board policies and handbooks.</p>
          </article>
        </section>

        <section className="pta-section pta-steps" id="how-it-works">
          <div className="pta-section-heading">
            <p className="pta-eyebrow">How it works</p>
            <h2>A clearer path through complicated decisions.</h2>
            <p>
              Policy Aligned organizes the search, evidence, and next steps without replacing
              the professional judgment of the administrator responsible for the decision.
            </p>
          </div>

          <ol className="pta-step-grid">
            <li>
              <span className="pta-step-number">1</span>
              <h3>Add your district sources</h3>
              <p>
                Import the board policy manual and upload student and staff handbooks into one
                private district library.
              </p>
            </li>
            <li>
              <span className="pta-step-number">2</span>
              <h3>Describe what happened</h3>
              <p>
                Ask a real scenario in natural language, including the people, constraints, and
                complications that matter.
              </p>
            </li>
            <li>
              <span className="pta-step-number">3</span>
              <h3>Verify before you act</h3>
              <p>
                Review the policy-grounded guidance, open the exact citations, and work through a
                numbered action plan.
              </p>
            </li>
          </ol>
        </section>

        <section className="pta-evidence">
          <figure className="pta-evidence-shot">
            <Image
              src="/landing/answer.jpg"
              alt="A structured Policy Aligned response with relevant policies, citations, and recommended actions"
              width={1208}
              height={729}
            />
          </figure>

          <div className="pta-evidence-copy">
            <p className="pta-eyebrow">Answers with a policy trail</p>
            <h2>Move from “What applies?” to “What should we do next?”</h2>
            <p>
              Each response identifies the policies that touch the scenario, explains their
              implications, and turns that evidence into practical next steps.
            </p>
            <ul>
              <li>Relevant policies and handbook provisions are named directly.</li>
              <li>Recommended actions are separated into a clear, numbered sequence.</li>
              <li>Critical claims link back to the exact governing text.</li>
            </ul>
          </div>
        </section>

        <section className="pta-section pta-readiness" id="district-ready">
          <div className="pta-section-heading">
            <p className="pta-eyebrow">District readiness</p>
            <h2>Designed for responsible use in real school systems.</h2>
            <p>
              The platform keeps district materials, verification, and professional judgment at
              the center of the workflow.
            </p>
          </div>

          <div className="pta-readiness-grid">
            <article>
              <span className="pta-card-kicker">Grounded</span>
              <h3>Your sources only</h3>
              <p>Guidance is built from the policies and handbooks connected to your workspace.</p>
            </article>
            <article>
              <span className="pta-card-kicker">Private</span>
              <h3>District-scoped workspaces</h3>
              <p>Accounts, uploaded materials, conversations, and saved work stay scoped by user.</p>
            </article>
            <article>
              <span className="pta-card-kicker">Reviewable</span>
              <h3>Evidence before action</h3>
              <p>Open the cited source, confirm the context, and apply local procedures.</p>
            </article>
            <article>
              <span className="pta-card-kicker">Accessible</span>
              <h3>Built-in reading controls</h3>
              <p>Contrast, text-size, reduced-motion, and document-reading controls support use.</p>
            </article>
          </div>

          <p className="pta-readiness-note">
            Policy Aligned is decision support, not legal advice. Verify critical decisions
            against the cited source and applicable district procedures.
          </p>
        </section>

        <section className="pta-section pta-resources" id="resources">
          <div className="pta-section-heading">
            <p className="pta-eyebrow">Resources</p>
            <h2>Everything your team needs to begin.</h2>
            <p>Guides for administrators, district setup leads, and technology teams.</p>
          </div>

          <ul className="pta-resource-grid">
            {resources.map((resource) => (
              <li key={resource.href}>
                <a href={resource.href} target="_blank" rel="noreferrer">
                  <span>
                    <b>{resource.title}</b>
                    <small>{resource.description}</small>
                  </span>
                  <span className="pta-resource-action" aria-hidden="true">
                    Open PDF
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="pta-cta">
          <div>
            <p className="pta-eyebrow">Policy Aligned</p>
            <h2>Give every decision a clear policy trail.</h2>
            <p>Bring your district sources together and make the evidence easier to act on.</p>
          </div>
          <div className="pta-cta-actions">
            <Link className="pta-button pta-button-primary pta-button-large" href={APP_ROUTE}>
              Create your workspace
            </Link>
            <Link className="pta-button pta-button-dark-ghost pta-button-large" href={APP_ROUTE}>
              Sign in
            </Link>
          </div>
        </section>
      </main>

      <footer className="pta-footer">
        <Link className="pta-brand" href={"/" as Route} aria-label="Policy Aligned home">
          <span className="pta-brand-chip is-small">
            <Image src="/logo-icon.png" alt="" width={26} height={22} />
          </span>
          <span className="pta-brand-word">Policy Aligned</span>
        </Link>
        <p>
          A Scarlet Fire LLC product. Guidance is generated from your district&rsquo;s uploaded
          policies and is not legal advice; verify critical decisions against the cited source.
        </p>
        <Link className="pta-footer-link" href={"/privacy" as Route}>
          Privacy policy
        </Link>
      </footer>
    </div>
  );
}
