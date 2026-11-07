import type { Metadata } from "next";
import Link from "next/link";
import { FeedbackButton } from "@/components/feedback-dialog";

export const metadata: Metadata = {
  title: "About, terms and privacy",
  description: "Who makes Verses Across, the terms of use, privacy, and credits for every text.",
  alternates: { canonical: "/about" },
};

const REPO = "https://github.com/sknapp1991/snoopwiggy";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section id={title.toLowerCase().replace(/[^a-z]+/g, "-")} className="scroll-mt-4 space-y-3">
      <h2 className="font-serif text-xl font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

const a = "underline underline-offset-2 hover:text-ink";

export default function AboutPage() {
  return (
    <main className="h-dvh overflow-y-auto bg-paper text-muted">
      <div className="mx-auto max-w-2xl space-y-10 px-4 pb-16 pt-8 leading-relaxed md:px-8">
        <header className="space-y-3">
          <Link href="/" className={`text-sm ${a}`}>
            ← Back to reading
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-ink">About Verses Across</h1>
          <p>
            Verses Across lets you read the world&rsquo;s scriptures side by side, in many languages. It is free, and
            always will be: no ads, no purchases, no account.
          </p>
        </header>

        <Section title="Copyright and license">
          <p>
            Copyright © 2026 <strong className="text-ink">Skylar Knapp</strong> and{" "}
            <strong className="text-ink">Michael Knapp</strong>, co-owners of Verses Across.
          </p>
          <p>
            The app&rsquo;s code is free software under the{" "}
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer" className={a}>
              GNU Affero General Public License v3.0
            </a>{" "}
            or later. You may use, change and share it, as long as your version stays open source under the same license.
            The code is on{" "}
            <a href={REPO} target="_blank" rel="noopener noreferrer" className={a}>
              GitHub
            </a>
            .
          </p>
          <p>
            The name &ldquo;Verses Across&rdquo; and its logo are not covered by that license. If you share a modified
            version, please give it its own name and logo.
          </p>
        </Section>

        <Section title="The texts and recordings">
          <p>
            The scriptures are not ours. Every text is public domain or shared under an open licence by its translators
            and publishers, and each one is credited, with a link to its source, at the bottom of every chapter. A few are
            shared for non-commercial use only: the William Davidson Talmud (via Sefaria) and the Bah&aacute;&rsquo;&iacute;
            writings (&copy; Bah&aacute;&rsquo;&iacute; International Community). Please respect each text&rsquo;s own
            licence if you copy it.
          </p>
          <p>
            The texts are shown as published: we change formatting only, never wording. Every translation is the work of
            its human translators, with one clearly marked exception below.
          </p>
          <p>
            <strong className="text-ink">AI translations.</strong> For a few texts no free English translation exists, or
            only part of one does. For those we made an English version with AI (Claude, by Anthropic), currently{" "}
            <em>Mencius</em> and the complete <em>Popol Vuh</em>. These are always separate versions, never mixed into a
            human translation: each is named &ldquo;AI translation&rdquo;, carries an <strong className="text-ink">AI</strong>{" "}
            badge above its column, and sits beside the original-language text it was translated from so you can compare.
            They can contain mistakes. We may add more where nothing else exists, always labelled the same way.
          </p>
          <p>
            <strong className="text-ink">Audio.</strong> The King James Version is read by a LibriVox volunteer. The other
            recorded voices are computer voices (Kokoro, an open text-to-speech model). Where there is no recording, your
            phone or computer&rsquo;s own built-in voice reads the text aloud.
          </p>
        </Section>

        <Section title="Terms of use">
          <ul className="list-disc space-y-2 pl-5">
            <li>You are welcome to use Verses Across for personal study, teaching, worship and sharing.</li>
            <li>
              It is provided &ldquo;as is&rdquo;, without warranty of any kind. We work hard to keep texts, verse numbers
              and audio accurate, but mistakes can happen. Check an authoritative printed edition for anything important.
            </li>
            <li>
              AI translations and computer-voice audio are made by a computer and can contain mistakes. Compare with the
              original-language text or a human translation for anything important.
            </li>
            <li>
              Answers from the AI companion are generated by a computer and can be wrong. They are not religious, legal,
              medical or professional advice.
            </li>
            <li>Please don&rsquo;t misuse the service, for example by flooding it with automated requests.</li>
            <li>We may change or improve the app, and these terms, at any time.</li>
          </ul>
        </Section>

        <Section title="Privacy">
          <ul className="list-disc space-y-2 pl-5">
            <li>There are no accounts, ads or tracking.</li>
            <li>
              Your notes, highlights, bookmarks, plans and settings are stored only on your device. We never see them. Clearing
              your browser data deletes them.
            </li>
            <li>
              When you ask the AI companion a question, the question and the passage you&rsquo;re reading are sent to the AI
              service you picked to get an answer: Google Gemini, or OpenAI&rsquo;s open model (GPT-OSS) run by Cloudflare.
              Don&rsquo;t include personal information you want to keep private.
            </li>
            <li>
              Cross references (&ldquo;similar verses&rdquo;) are worked out in advance and stored with the app; looking
              them up sends nothing about you anywhere.
            </li>
            <li>
              If you send feedback, we receive what you write, your email address if you give one, and (unless you untick
              it) the page you were on, the verse and versions on screen, your device and browser type, your reading
              settings and any recent error messages. You can see all of it before sending. We store reports privately,
              use them only to fix and improve Verses Across, and never share or sell them. Ask us and we&rsquo;ll delete
              yours.
            </li>
            <li>
              Like every website, our host (Cloudflare) briefly handles standard technical data such as your IP address, to
              deliver pages and to limit abuse.
            </li>
            <li>
              The Android app is this same website in an app window, so everything above applies to it too. It asks for no
              special permissions and collects nothing extra.
            </li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Found a mistake in a text, a problem with the audio, or a bug? Or have an idea? Tell us, no account needed:
          </p>
          <FeedbackButton className="min-h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink">Send feedback</FeedbackButton>
          <p className="text-sm">
            The quickest way to report a problem with one verse: tap or click the verse, then &ldquo;Report it&rdquo; at the
            bottom of its menu. The verse and versions are filled in for you. You can also{" "}
            <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer" className={a}>
              open an issue on GitHub
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
