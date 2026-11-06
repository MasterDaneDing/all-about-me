import { createFileRoute } from "@tanstack/react-router";
import { Book } from "@/all-about/book";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Book />;
}
