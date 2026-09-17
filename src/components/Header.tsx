import Logo from "./Logo";

export default function Header() {
  return (
    <header className="border-b border-gold/40 bg-[#2F6B5E] shadow-[0_2px_12px_rgba(0,0,0,0.15)]">
      <div className="mx-auto flex max-w-[920px] items-center gap-3 px-4 py-2.5 sm:py-3">
        <Logo className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-balance text-[16px] font-bold leading-tight text-[#faf7f1] sm:text-[19px]">
            הדיין הרב אבישי טהרני שליט&quot;א
          </h1>
          <p className="text-[11px] text-[#cdc3ae] sm:text-[12px]">
            ארכיון שיעורים - וידאו, אודיו ו-PDF
          </p>
        </div>
      </div>
    </header>
  );
}
