import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted">
        That page does not exist. <Link className="underline" to="/">Go to all claims</Link>.
      </p>
    </div>
  );
}
