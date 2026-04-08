import Link from 'next/link'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#F2F5F4] text-[#16423C] px-6 py-16 md:px-12 max-w-2xl">
      <Link href="/" className="text-sm uppercase tracking-widest text-[#3F524C] hover:text-[#16423C]">
        ← Home
      </Link>
      <h1 className="mt-8 text-3xl font-medium serif italic">Privacy</h1>
      <p className="mt-6 text-[#3F524C] leading-relaxed">
        Lemma may store tutoring session timing and the text of chat turns you exchange with the tutor for product
        improvement. Voice is processed by our AI provider according to their terms. Contact the team if you have
        questions about your data.
      </p>
    </div>
  )
}
