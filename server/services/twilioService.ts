import twilio from "twilio";
import OpenAI from "openai";
import { db } from "../db";
import { systemSettings } from "@shared/schema";
import { eq } from "drizzle-orm";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error("X_REPLIT_TOKEN not found for repl/depl");
  }

  connectionSettings = await fetch(
    "https://" +
      hostname +
      "/api/v2/connection?include_secrets=true&connector_names=twilio",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  if (
    !connectionSettings ||
    !connectionSettings.settings.account_sid ||
    !connectionSettings.settings.api_key ||
    !connectionSettings.settings.api_key_secret
  ) {
    throw new Error("Twilio not connected");
  }
  return {
    accountSid: connectionSettings.settings.account_sid,
    apiKey: connectionSettings.settings.api_key,
    apiKeySecret: connectionSettings.settings.api_key_secret,
    phoneNumber: connectionSettings.settings.phone_number,
  };
}

function getBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.REPLIT_DOMAINS) {
    return `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`;
  }
  return `https://localhost:5000`;
}

export async function getTwilioClient() {
  const creds = await getCredentials();
  return twilio(creds.apiKey, creds.apiKeySecret, {
    accountSid: creds.accountSid,
  });
}

export async function getTwilioFromPhoneNumber(): Promise<string> {
  const creds = await getCredentials();
  return creds.phoneNumber;
}

export async function isTwilioConfigured(): Promise<boolean> {
  try {
    await getCredentials();
    return true;
  } catch {
    return false;
  }
}

export async function getOrCreateTwimlApp(): Promise<string> {
  const existing = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "twilio_twiml_app_sid"))
    .limit(1);

  if (existing.length > 0 && existing[0].value) {
    return existing[0].value;
  }

  const client = await getTwilioClient();
  const baseUrl = getBaseUrl();

  const app = await client.applications.create({
    friendlyName: "SupplyStreamline Voice",
    voiceUrl: baseUrl + "/api/twilio/voice",
    voiceMethod: "POST",
    statusCallback: baseUrl + "/api/twilio/status",
    statusCallbackMethod: "POST",
  });

  await db
    .insert(systemSettings)
    .values({ key: "twilio_twiml_app_sid", value: app.sid })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: app.sid },
    });

  return app.sid;
}

export async function generateAccessToken(identity: string): Promise<string> {
  const creds = await getCredentials();
  const twimlAppSid = await getOrCreateTwimlApp();

  const token = new AccessToken(
    creds.accountSid,
    creds.apiKey,
    creds.apiKeySecret,
    { identity, ttl: 3600 },
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: false,
  });

  token.addGrant(voiceGrant);

  return token.toJwt();
}

export async function initiateCallBrowser(
  callLogId: number,
  toNumber: string,
): Promise<string> {
  const token = await generateAccessToken(`agent_${callLogId}`);
  return token;
}

export async function initiateBridgedCall(
  callLogId: number,
  agentPhone: string,
  toNumber: string,
  fromNumber: string,
): Promise<string> {
  const client = await getTwilioClient();
  const baseUrl = getBaseUrl();

  const call = await client.calls.create({
    url:
      baseUrl +
      "/api/twilio/bridge?to=" +
      encodeURIComponent(toNumber) +
      "&callLogId=" +
      callLogId,
    to: agentPhone,
    from: fromNumber,
    record: true,
    recordingStatusCallback: baseUrl + "/api/twilio/recording",
    statusCallback: baseUrl + "/api/twilio/status",
    statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
  });

  return call.sid;
}

export async function getRecordingAudioUrl(
  recordingSid: string,
): Promise<string> {
  const creds = await getCredentials();
  return `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Recordings/${recordingSid}.mp3`;
}

export async function transcribeRecording(
  recordingUrl: string,
): Promise<string> {
  const openai = new OpenAI({
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  });

  const audioResponse = await fetch(recordingUrl + ".mp3");
  const audioBuffer = await audioResponse.arrayBuffer();
  const audioFile = new File([audioBuffer], "recording.mp3", {
    type: "audio/mpeg",
  });

  const transcription = await openai.audio.transcriptions.create({
    file: audioFile,
    model: "whisper-1",
  });

  return transcription.text;
}
