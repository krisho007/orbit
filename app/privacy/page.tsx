import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy - Orbit',
  description: 'Privacy Policy for Orbit Personal CRM',
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          <div className="space-y-4">
            <Link 
              href="/"
              className="inline-flex items-center text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ← Back to Home
            </Link>
            <h1 className="text-4xl font-bold text-gray-900">Privacy Policy</h1>
            <p className="text-gray-600">Last updated: December 10, 2025</p>
          </div>

          <div className="prose prose-gray max-w-none space-y-6">
            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">1. Introduction</h2>
              <p className="text-gray-700 leading-relaxed">
                Welcome to Orbit ("we," "our," or "us"). We are committed to protecting your personal information 
                and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard 
                your information when you use our Personal CRM application.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">2. Information We Collect</h2>
              
              <h3 className="text-xl font-semibold text-gray-800">2.1 Information You Provide</h3>
              <p className="text-gray-700 leading-relaxed">We collect information that you voluntarily provide to us when you:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Register for an account using Google OAuth</li>
                <li>Create and manage contacts</li>
                <li>Add conversations and events</li>
                <li>Upload images and documents</li>
                <li>Use our AI assistant feature</li>
                <li>Update your profile and settings</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">2.2 Automatically Collected Information</h3>
              <p className="text-gray-700 leading-relaxed">When you use Orbit, we automatically collect certain information, including:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Device information (browser type, operating system)</li>
                <li>Usage data (pages visited, features used)</li>
                <li>Log data (IP address, access times)</li>
              </ul>

              <h3 className="text-xl font-semibold text-gray-800 mt-6">2.3 Third-Party Data</h3>
              <p className="text-gray-700 leading-relaxed">
                We receive basic profile information from Google when you sign in using Google OAuth, 
                including your name, email address, and profile picture.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">3. How We Use Your Information</h2>
              <p className="text-gray-700 leading-relaxed">We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Provide, operate, and maintain our service</li>
                <li>Enable multi-tenant data isolation and security</li>
                <li>Process your requests and transactions</li>
                <li>Provide AI-powered assistant features using OpenAI</li>
                <li>Send you technical notices and support messages</li>
                <li>Improve and optimize our application</li>
                <li>Detect and prevent fraud and abuse</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">4. Data Storage and Security</h2>
              <p className="text-gray-700 leading-relaxed">
                Your data is stored securely using industry-standard practices:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li><strong>Database:</strong> PostgreSQL hosted on Supabase with encryption at rest and in transit</li>
                <li><strong>File Storage:</strong> Images stored in Supabase Storage with access controls</li>
                <li><strong>Authentication:</strong> Secure OAuth 2.0 authentication via Google</li>
                <li><strong>Multi-tenancy:</strong> All data is isolated by user ID ensuring complete data separation</li>
                <li><strong>HTTPS:</strong> All data transmission is encrypted using SSL/TLS</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                While we implement strong security measures, no method of transmission over the internet 
                or electronic storage is 100% secure. We cannot guarantee absolute security.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">5. Third-Party Services</h2>
              <p className="text-gray-700 leading-relaxed">We use the following third-party services:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li><strong>Google OAuth:</strong> For authentication (subject to Google's Privacy Policy)</li>
                <li><strong>Supabase:</strong> For database and file storage (subject to Supabase's Privacy Policy)</li>
                <li><strong>OpenAI:</strong> For AI assistant features (subject to OpenAI's Privacy Policy)</li>
                <li><strong>Vercel:</strong> For hosting and deployment (subject to Vercel's Privacy Policy)</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                These third-party services have their own privacy policies. We encourage you to review them.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">6. Data Sharing and Disclosure</h2>
              <p className="text-gray-700 leading-relaxed">
                We do not sell, rent, or share your personal information with third parties except:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>With your explicit consent</li>
                <li>To comply with legal obligations or court orders</li>
                <li>To protect our rights, property, or safety</li>
                <li>In connection with a business transfer (merger, acquisition, etc.)</li>
                <li>With service providers who assist in operating our service (under strict confidentiality agreements)</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">7. Your Privacy Rights</h2>
              <p className="text-gray-700 leading-relaxed">Depending on your location, you may have the following rights:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li><strong>Access:</strong> Request access to your personal data</li>
                <li><strong>Correction:</strong> Request correction of inaccurate data</li>
                <li><strong>Deletion:</strong> Request deletion of your data</li>
                <li><strong>Export:</strong> Request a copy of your data in a portable format</li>
                <li><strong>Opt-out:</strong> Opt-out of certain data processing activities</li>
                <li><strong>Withdraw Consent:</strong> Withdraw your consent at any time</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                To exercise these rights, please contact us at the email address provided below.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">8. Data Retention</h2>
              <p className="text-gray-700 leading-relaxed">
                We retain your personal information only as long as necessary to provide our services and 
                fulfill the purposes outlined in this Privacy Policy. When you delete your account, we will 
                delete or anonymize your personal data, unless we are required to retain it for legal purposes.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">9. Children's Privacy</h2>
              <p className="text-gray-700 leading-relaxed">
                Our service is not intended for children under the age of 13. We do not knowingly collect 
                personal information from children under 13. If you believe we have collected information 
                from a child under 13, please contact us immediately.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">10. International Data Transfers</h2>
              <p className="text-gray-700 leading-relaxed">
                Your information may be transferred to and processed in countries other than your country of 
                residence. These countries may have different data protection laws. By using Orbit, you consent 
                to the transfer of your information to these countries.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">11. AI and Machine Learning</h2>
              <p className="text-gray-700 leading-relaxed">
                Our AI assistant feature uses OpenAI's API to process natural language queries. When you use 
                the assistant, your queries and relevant contact data are sent to OpenAI for processing. 
                We do not use your data to train AI models. Please refer to OpenAI's privacy policy for 
                details on their data handling practices.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">12. Changes to This Privacy Policy</h2>
              <p className="text-gray-700 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes by 
                posting the new Privacy Policy on this page and updating the "Last updated" date. You are 
                advised to review this Privacy Policy periodically for any changes.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">13. Contact Us</h2>
              <p className="text-gray-700 leading-relaxed">
                If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg mt-4">
                <p className="text-gray-700">
                  <strong>Email:</strong> privacy@orbit-crm.com<br />
                  <strong>Website:</strong> <Link href="/" className="text-indigo-600 hover:text-indigo-700">orbit-crm.com</Link>
                </p>
              </div>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">14. GDPR Compliance (EU Users)</h2>
              <p className="text-gray-700 leading-relaxed">
                If you are located in the European Economic Area (EEA), you have additional rights under the 
                General Data Protection Regulation (GDPR), including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Right to access your personal data</li>
                <li>Right to rectification of inaccurate data</li>
                <li>Right to erasure ("right to be forgotten")</li>
                <li>Right to restrict processing</li>
                <li>Right to data portability</li>
                <li>Right to object to processing</li>
                <li>Rights related to automated decision-making</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                Our legal basis for processing your data includes: consent, contract performance, legal obligations, 
                and legitimate interests.
              </p>
            </section>

            <section className="space-y-4">
              <h2 className="text-2xl font-semibold text-gray-900">15. CCPA Rights (California Users)</h2>
              <p className="text-gray-700 leading-relaxed">
                If you are a California resident, you have specific rights under the California Consumer Privacy Act (CCPA):
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                <li>Right to know what personal information is collected</li>
                <li>Right to know if personal information is sold or disclosed</li>
                <li>Right to opt-out of the sale of personal information</li>
                <li>Right to request deletion of personal information</li>
                <li>Right to non-discrimination for exercising CCPA rights</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-4">
                <strong>Note:</strong> We do not sell your personal information.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

