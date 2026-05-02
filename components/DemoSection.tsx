'use client'

export default function DemoSection() {
  return (
    <section
      id="demo"
      className="relative z-10 flex w-full flex-col items-center border-t border-[#D1DBD7] bg-[#F2F5F4] px-6 py-20 md:px-12"
    >
      <div className="w-full max-w-5xl">
        <div className="mx-auto mb-8 max-w-3xl text-center">
          <p className="mb-3 text-[10px] font-medium uppercase tracking-[0.24em] text-[#5C7069]">
            Demo
          </p>
          <h3 className="serif text-[1.9rem] leading-tight text-[#0F2922] md:text-[2.35rem]">
            See Lemma in action.
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-[0.94rem] font-light leading-relaxed text-[#3F524C] md:text-[0.98rem]">
            Watch Lemma follow a student&apos;s work, listen to their reasoning, and
            respond while they solve.
          </p>
        </div>

        <div className="overflow-hidden rounded-[22px] border border-[#D8E4DF] bg-white shadow-[0_34px_80px_-46px_rgba(15,41,34,0.28)]">
          <div className="flex items-center justify-between border-b border-[#E6ECE9] bg-white/95 px-4 py-3 backdrop-blur-sm">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full border border-black/10 bg-[#FF5F57]" />
              <div className="h-3 w-3 rounded-full border border-black/10 bg-[#FEBC2E]" />
              <div className="h-3 w-3 rounded-full border border-black/10 bg-[#28C840]" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Product Demo
            </div>
            <div className="w-10" />
          </div>

          <div className="relative w-full bg-[#EEF3F0]" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src="https://www.loom.com/embed/a1a084ba9ec440ec9eda01b44411b836"
              className="absolute inset-0 h-full w-full"
              frameBorder="0"
              allowFullScreen
              title="Lemma Loom demo"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3 opacity-70">
          {[
            'Voice reasoning',
            'Shared canvas',
            'Real-time feedback',
            'Math-focused guidance',
          ].map((label) => (
            <div key={label} className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-[#16423C]" />
              <span className="text-[10px] uppercase tracking-wider text-[#5C7069]">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
