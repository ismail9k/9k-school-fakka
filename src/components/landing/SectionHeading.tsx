export function SectionHeading({
  kicker,
  title,
  onGreen = false,
}: {
  kicker: string;
  title: string;
  onGreen?: boolean;
}) {
  return (
    <>
      <p
        className={`font-heading text-xs tracking-widest uppercase rtl:text-sm rtl:tracking-normal ${
          onGreen ? "text-gold" : "text-green"
        }`}
      >
        {kicker}
      </p>
      <h2 className="mt-2 font-heading text-3xl leading-tight text-balance rtl:leading-snug md:text-4xl">
        {title}
      </h2>
    </>
  );
}
