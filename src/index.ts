import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  const mode = config.githubStub ? "stub GitHub" : "live GitHub App";
  console.log(`Bridge App listening on ${config.appBaseUrl} (${mode})`);
});
