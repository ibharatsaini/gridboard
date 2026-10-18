import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }));
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        {children}
        <Toaster position="bottom-center" closeButton richColors toastOptions={{ duration: 2600 }} />
      </MotionConfig>
    </QueryClientProvider>
  );
}
