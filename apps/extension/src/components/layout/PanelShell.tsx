import React from 'react';

export interface PanelShellProps {
  header: React.ReactNode;
  statusStrip: React.ReactNode;
  children: React.ReactNode;
  composer: React.ReactNode;
}

export const PanelShell: React.FC<PanelShellProps> = ({
  header,
  statusStrip,
  children,
  composer,
}) => {
  return (
    <div className="flex flex-col h-screen w-full min-w-[320px] bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 font-sans antialiased select-text">
      {header}
      {statusStrip}
      <main className="flex-1 overflow-y-auto relative">{children}</main>
      {composer}
    </div>
  );
};
