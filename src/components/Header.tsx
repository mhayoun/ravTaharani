import Logo from "./Logo";

export default function Header() {
  return (
    <header className="border-b-2 border-gold bg-[#1e2422]">
      <div className="mx-auto flex max-w-[920px] items-center gap-4 px-4 py-5 sm:py-6">
        <Logo className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
        <div className="flex flex-col gap-0.5">
          <h1 className="text-balance text-[22px] font-bold leading-tight text-[#f2f1ea] sm:text-[28px]">
            הדיין הרב אבישי טהרני שליט&quot;א
          </h1>
          <p className="text-[13px] text-[#c9c4b3] sm:text-[14.5px]">
            ארכיון שיעורים - וידאו, אודיו ו-PDF
          </p>
        </div>
      </div>
    </header>
  );
}
