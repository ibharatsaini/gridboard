import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { useState, type FormEvent } from "react";
import { COLOR_PALETTE, DISPLAY_NAME_MAX, joinRequestSchema, type JoinRequest } from "@gridboard/shared";
import { Check, Grid3x3, Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { keys } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function JoinScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_PALETTE[7]!.hex);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: (body: JoinRequest) => api.join(body),
    onSuccess: (session) => qc.setQueryData(keys.me, session),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = joinRequestSchema.safeParse({ displayName: name, color });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Check your details");
      return;
    }
    setFieldError(null);
    join.mutate(parsed.data);
  };

  const serverMessage = join.error instanceof ApiError ? join.error.message : join.error ? "Something went wrong." : null;
  const error = fieldError ?? serverMessage;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.form
        onSubmit={submit}
        noValidate
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-sm sm:p-8"
        aria-labelledby="join-title"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid size-11 place-items-center rounded-xl bg-ink text-surface">
            <Grid3x3 className="size-5" aria-hidden />
          </div>
          <h1 id="join-title" className="text-xl font-semibold tracking-tight">Shared Grid</h1>
          <p className="mt-1 text-sm text-muted">Claim territory together.</p>
        </div>

        <label htmlFor="name" className="mb-1.5 block text-sm font-medium">Display name</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={DISPLAY_NAME_MAX}
          autoComplete="nickname"
          // The join screen is a dedicated page with exactly one field, so focusing it on arrival is expected, not a surprise.
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          placeholder="Bharat"
          aria-invalid={!!error}
          aria-describedby={error ? "join-error" : undefined}
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted/70"
        />

        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-medium">Choose your color</legend>
          <div role="radiogroup" aria-label="Color" className="grid grid-cols-6 gap-2">
            {COLOR_PALETTE.map((c) => {
              const selected = c.hex === color;
              return (
                <button
                  key={c.hex}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={c.name}
                  onClick={() => setColor(c.hex)}
                  style={{ backgroundColor: c.hex }}
                  className={cn(
                    "relative grid aspect-square place-items-center rounded-full text-white transition-transform hover:scale-110 active:scale-95",
                    selected && "ring-2 ring-ink ring-offset-2 ring-offset-panel",
                  )}
                >
                  {selected && <Check className="size-4" aria-hidden />}
                </button>
              );
            })}
          </div>
        </fieldset>

        <p id="join-error" role="alert" className="mt-3 min-h-5 text-sm text-red-600 dark:text-red-400">{error}</p>

        <Button type="submit" className="mt-2 w-full" disabled={join.isPending}>
          {join.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {join.isPending ? "Joining…" : "Join Board"}
        </Button>
      </motion.form>
    </main>
  );
}
