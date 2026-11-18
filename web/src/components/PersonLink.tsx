import { Link } from "react-router-dom";
import { isHandle } from "../lib/people";

/** A contributor's name, linked to their profile when it is a valid GitHub username. */
export function PersonLink({ handle, className = "underline underline-offset-2 hover:text-fg" }: { handle: string; className?: string }) {
  return isHandle(handle) ? (
    <Link to={`/people/${handle}`} className={className}>
      {handle}
    </Link>
  ) : (
    <span>{handle}</span>
  );
}
