import Gradient from "@digitalocean/gradient";

const counselAgent = new Gradient({
  agentAccessKey: process.env.GRADIENT_AGENT_KEY_COUNSEL!,
  agentEndpoint: process.env.GRADIENT_AGENT_URL_COUNSEL!,
});

export { counselAgent };
