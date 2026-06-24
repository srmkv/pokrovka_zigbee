// src/components/LargeCard.tsx
import React from "react";

export interface LargeCardProps {
  title: string;
  num: number | string;         // можно и строку
  desc?: string;                // сделал необязательным
  children?: React.ReactNode;   // чтобы TS не ругался
  className?: string;           // можно передать h-full и т.п.
  minHeight?: number;           // единая высота по умолчанию
}

const LargeCard: React.FC<LargeCardProps> = ({
  title,
  num,
  desc = "",
  children,
  className = "",
  minHeight = 170,
}) => {
  return (
    <div
      className={
        `bg-darkblue rounded-xl py-5 px-6 flex flex-col justify-between
         border border-[#2a2b46] shadow-sm ${className}`
      }
      style={{ minHeight }}
    >
      <div>
        <p className="text-gray-350">{title}</p>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-4xl sm:text-5xl md:text-6xl font-bold leading-none text-gray-150">{num}</span>
          {desc ? (
            <span className="text-4xl font-normal text-gray-250 mb-[4px]">{desc}</span>
          ) : null}
        </div>
      </div>

      {children ? <div className="mt-auto pt-3">{children}</div> : null}
    </div>
  );
};

export default LargeCard;
