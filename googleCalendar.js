import { google } from 'googleapis';
import 'dotenv/config';

const REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/oauth/callback';
const SYSTEM_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';

/**
 * Creates a base OAuth2 client (without user credentials).
 * Uses GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from env.
 */
function getBaseOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

/**
 * Creates an OAuth2 client authenticated with a specific user's refresh token.
 * @param {string} refreshToken - The user's refresh token from the token store.
 * @returns {google.auth.OAuth2}
 */
function getOAuth2ClientForUser(refreshToken) {
  const client = getBaseOAuth2Client();
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Returns the Google OAuth2 authorization URL.
 * Passes sessionId as the `state` parameter so the callback can associate
 * the token with the correct user session.
 * @param {string} sessionId
 * @returns {string}
 */
function getAuthUrl(sessionId) {
  const oauth2Client = getBaseOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: sessionId,
  });
}

/**
 * Exchanges an authorization code for tokens.
 * @param {string} code - The authorization code from the OAuth callback.
 * @returns {Promise<object>} The tokens object containing access_token and refresh_token.
 */
async function getTokensFromCode(code) {
  const oauth2Client = getBaseOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

/**
 * Helper: get an authenticated Calendar client for a specific user.
 * @param {string} refreshToken
 */
function getCalendarClient(refreshToken) {
  if (!refreshToken) {
    throw new Error(
      'Google Calendar not connected. Please click "Connect Calendar" in the tools menu (+) to authenticate.'
    );
  }
  const auth = getOAuth2ClientForUser(refreshToken);
  return google.calendar({ version: 'v3', auth });
}

/**
 * Lists upcoming calendar events for a specific user.
 * @param {object} options
 * @param {string} options.refreshToken - The user's refresh token.
 * @param {number} [options.maxResults=10]
 * @param {number} [options.daysAhead=7]
 */
async function listEvents({ refreshToken, maxResults = 10, daysAhead = 7 } = {}) {
  const calendar = getCalendarClient(refreshToken);

  const now = new Date();
  const timeMax = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = response.data.items || [];

  return events.map((event) => {
    const meetLink = event.hangoutLink ||
      event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;

    return {
      id: event.id,
      summary: event.summary || '(No title)',
      start: event.start?.dateTime || event.start?.date || 'Unknown',
      end: event.end?.dateTime || event.end?.date || 'Unknown',
      timeZone: event.start?.timeZone || SYSTEM_TIMEZONE,
      location: event.location || null,
      description: event.description || null,
      htmlLink: event.htmlLink || null,
      meetLink: meetLink,
    };
  });
}

/**
 * Creates a new calendar event with optional auto-generated Google Meet video link.
 * @param {object} options
 * @param {string} options.refreshToken - The user's refresh token.
 * @param {string} options.summary - Event title.
 * @param {string} options.startDateTime - ISO 8601 start time.
 * @param {string} options.endDateTime - ISO 8601 end time.
 * @param {string} [options.description]
 * @param {string} [options.location]
 * @param {string} [options.timeZone]
 * @param {boolean} [options.createMeetingLink=true] - Whether to generate a Google Meet video conference link.
 */
async function createEvent({
  refreshToken,
  summary,
  startDateTime,
  endDateTime,
  description,
  location,
  timeZone = SYSTEM_TIMEZONE,
  createMeetingLink = true
}) {
  const calendar = getCalendarClient(refreshToken);
  const tz = timeZone || SYSTEM_TIMEZONE;

  const event = {
    summary,
    description: description || undefined,
    location: location || undefined,
    start: { dateTime: startDateTime, timeZone: tz },
    end: { dateTime: endDateTime, timeZone: tz },
  };

  const insertParams = {
    calendarId: 'primary',
    requestBody: event,
  };

  if (createMeetingLink) {
    insertParams.conferenceDataVersion = 1;
    event.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const response = await calendar.events.insert(insertParams);

  const meetLink = response.data.hangoutLink ||
    response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;

  return {
    id: response.data.id,
    summary: response.data.summary,
    start: response.data.start?.dateTime || response.data.start?.date,
    end: response.data.end?.dateTime || response.data.end?.date,
    timeZone: response.data.start?.timeZone || tz,
    location: response.data.location || null,
    description: response.data.description || null,
    htmlLink: response.data.htmlLink,
    meetLink: meetLink,
    status: 'created',
  };
}

/**
 * Updates an existing calendar event.
 * @param {object} options
 * @param {string} options.refreshToken - The user's refresh token.
 * @param {string} options.eventId - The event ID to update.
 * @param {string} [options.summary]
 * @param {string} [options.startDateTime]
 * @param {string} [options.endDateTime]
 * @param {string} [options.description]
 * @param {string} [options.location]
 * @param {string} [options.timeZone]
 * @param {boolean} [options.createMeetingLink=false]
 */
async function updateEvent({
  refreshToken,
  eventId,
  summary,
  startDateTime,
  endDateTime,
  description,
  location,
  timeZone = SYSTEM_TIMEZONE,
  createMeetingLink = false
}) {
  const calendar = getCalendarClient(refreshToken);
  const tz = timeZone || SYSTEM_TIMEZONE;

  // First fetch the existing event
  const existing = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const updatedEvent = {
    summary: summary || existing.data.summary,
    description: description !== undefined ? description : existing.data.description,
    location: location !== undefined ? location : existing.data.location,
    start: startDateTime
      ? { dateTime: startDateTime, timeZone: tz }
      : existing.data.start,
    end: endDateTime
      ? { dateTime: endDateTime, timeZone: tz }
      : existing.data.end,
  };

  const updateParams = {
    calendarId: 'primary',
    eventId,
    requestBody: updatedEvent,
  };

  if (createMeetingLink && !existing.data.hangoutLink) {
    updateParams.conferenceDataVersion = 1;
    updatedEvent.conferenceData = {
      createRequest: {
        requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  const response = await calendar.events.update(updateParams);

  const meetLink = response.data.hangoutLink ||
    response.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;

  return {
    id: response.data.id,
    summary: response.data.summary,
    start: response.data.start?.dateTime || response.data.start?.date,
    end: response.data.end?.dateTime || response.data.end?.date,
    timeZone: response.data.start?.timeZone || tz,
    location: response.data.location || null,
    description: response.data.description || null,
    htmlLink: response.data.htmlLink,
    meetLink: meetLink,
    status: 'updated',
  };
}

/**
 * Deletes a calendar event.
 * @param {string} refreshToken - The user's refresh token.
 * @param {string} eventId - The event ID to delete.
 */
async function deleteEvent(refreshToken, eventId) {
  const calendar = getCalendarClient(refreshToken);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });

  return { id: eventId, status: 'deleted' };
}

/**
 * Gets details of a specific calendar event.
 * @param {string} refreshToken - The user's refresh token.
 * @param {string} eventId - The event ID.
 */
async function getEvent(refreshToken, eventId) {
  const calendar = getCalendarClient(refreshToken);

  const response = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const event = response.data;
  const meetLink = event.hangoutLink ||
    event.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri || null;

  return {
    id: event.id,
    summary: event.summary || '(No title)',
    start: event.start?.dateTime || event.start?.date || 'Unknown',
    end: event.end?.dateTime || event.end?.date || 'Unknown',
    timeZone: event.start?.timeZone || SYSTEM_TIMEZONE,
    location: event.location || null,
    description: event.description || null,
    htmlLink: event.htmlLink || null,
    meetLink: meetLink,
    attendees: event.attendees?.map(a => ({ email: a.email, status: a.responseStatus })) || [],
  };
}

export {
  getAuthUrl, getTokensFromCode,
  listEvents, createEvent, updateEvent, deleteEvent, getEvent,
};
