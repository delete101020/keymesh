export const onRequest = (context) => new Response(JSON.stringify({ hasToken: Boolean(context.env.REGISTRATION_TOKEN), origins: context.env.ALLOWED_ORIGINS }));
