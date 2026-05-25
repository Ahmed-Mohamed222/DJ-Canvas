import { createFileRoute } from "@tanstack/react-router";
import { Mixer } from "@/Mixer";

export const Route = createFileRoute("/")({
  component: Mixer,
  head: () => ({
    meta: [
      { title: "DJ Canvas" },
      { name: "description", content: "DJ Canvas - Professional dual-deck DJ mixing app — Web Audio, beat sync, effects, recording." },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { name: "theme-color", content: "#0a0a14" },
    ],
  }),
});
