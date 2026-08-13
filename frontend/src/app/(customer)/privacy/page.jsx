const EFFECTIVE_DATE = "August 13, 2026";

const SECTIONS = [
  { id: "information-we-collect", label: "1. Information We Collect" },
  { id: "how-we-use", label: "2. How We Use Your Information" },
  { id: "storage-retention", label: "3. Data Storage and Retention" },
  { id: "your-choices", label: "4. Your Data Choices" },
  { id: "security", label: "5. Security of Data" },
  { id: "changes", label: "6. Changes to This Privacy Policy" },
  { id: "contact", label: "7. Contact Us" },
];

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-28 py-8 border-b border-gray-100 last:border-b-0">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-4 text-[15px] text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-white">
      {/* Header */}
      <div className="border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 pt-16 pb-10">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-red-600 mb-3">Legal</p>
          <h1 className="text-3xl sm:text-4xl font-light text-gray-900">Privacy Policy</h1>
          <div className="text-sm text-gray-400 mt-3 space-y-1">
            <p>Effective Date: {EFFECTIVE_DATE}</p>
            <p>Company Name: Moulins Pharmaceuticals Pvt Ltd</p>
            <p>App Name: Moulins Pharma</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 sm:px-8 py-12 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-12">
        {/* TOC */}
        <nav className="hidden lg:block sticky top-24 self-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">On this page</p>
          <ol className="space-y-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-sm text-gray-500 hover:text-red-600 transition-colors">
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* Content */}
        <div className="min-w-0">
          <p className="text-[15px] text-gray-600 leading-relaxed pb-8 border-b border-gray-100">
            Moulins Pharmaceuticals Pvt Ltd (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates the
            Moulins Pharma mobile application. This Privacy Policy informs you of our policies regarding the
            collection, use, and disclosure of personal data when you use our app and the choices you have
            associated with that data.
          </p>

          <Section id="information-we-collect" title="1. Information We Collect">
            <p>
              To provide our B2B services, account management, and order processing, we collect the following
              types of information when you use our application:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Contact Information:</b> Such as your name, email address, physical business address, and
                phone number, which are required for account creation, billing, and communication.
              </li>
              <li>
                <b>Account Credentials &amp; Identifiers:</b> User IDs and authentication details necessary to
                secure your access.
              </li>
              <li>
                <b>Financial &amp; Transaction Information:</b> Purchase history and commercial order records
                required for business accounting, processing, and compliance.
              </li>
              <li>
                <b>Messages &amp; User Content:</b> In-app messages, uploaded images/photos shared within chat
                threads, and other user-generated content or custom notes.
              </li>
              <li>
                <b>App Activity &amp; Interactions:</b> Technical logs of app interactions and navigation to
                ensure proper functionality and performance.
              </li>
            </ul>
          </Section>

          <Section id="how-we-use" title="2. How We Use Your Information">
            <p>We use the collected data for the following legitimate business purposes:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>App Functionality:</b> To operate our services, authenticate users, process your commercial
                orders, display purchase history, and deliver in-app messages and content.
              </li>
              <li>
                <b>Account Management:</b> To manage user accounts, verify credentials, and handle profile
                setups.
              </li>
              <li>
                <b>Fraud Prevention, Security, and Compliance:</b> To monitor for unauthorized access, secure
                financial transactions, maintain legal compliance, and protect business integrity.
              </li>
            </ul>
          </Section>

          <Section id="storage-retention" title="3. Data Storage and Retention">
            <p>
              We do not share your personal or business data with any external third parties for marketing or
              commercial exploitation. All collected data is stored securely on our servers and is retained only
              as long as necessary to fulfill the purposes outlined in this policy, comply with our legal
              obligations, resolve disputes, and enforce our agreements.
            </p>
          </Section>

          <Section id="your-choices" title="4. Your Data Choices">
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <b>Required Data:</b> Certain information — such as your name, email, address, phone number, and
                purchase history — is mandatory for account creation and order processing. Users cannot opt out
                of providing this data while maintaining an active commercial account.
              </li>
              <li>
                <b>Optional Data:</b> Features like uploading photos or sending specific in-app content are at
                your discretion.
              </li>
            </ul>
          </Section>

          <Section id="security" title="5. Security of Data">
            <p>
              The security of your data is important to us. We implement appropriate technical and
              organizational security measures to protect your personal and financial information against
              unauthorized access, alteration, disclosure, or destruction.
            </p>
          </Section>

          <Section id="changes" title="6. Changes to This Privacy Policy">
            <p>
              We may update our Privacy Policy from time to time. We will notify you of any changes by posting
              the new Privacy Policy on this page and updating the effective date.
            </p>
          </Section>

          <Section id="contact" title="7. Contact Us">
            <p>If you have any questions about this Privacy Policy, please contact us:</p>
            <div className="not-prose bg-gray-50 rounded-xl border border-gray-200 p-5 text-[15px] text-gray-700">
              <p className="font-medium text-gray-900">Moulins Pharmaceuticals Pvt Ltd</p>
              <p>1st Floor, 363, Industrial Area Phase 2, Panchkula, Haryana 134113</p>
              <p className="mt-2">
                <a href="mailto:info@moulinspharma.com" className="text-red-600 hover:text-red-700">
                  info@moulinspharma.com
                </a>
              </p>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
