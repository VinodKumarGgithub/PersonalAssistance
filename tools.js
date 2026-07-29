
import { tavily } from "@tavily/core";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from 'zod';
import { tool } from "@langchain/core/tools";
import { listEvents, createEvent, updateEvent, deleteEvent, getEvent } from "./googleCalendar.js";


const searchTool = tool(
  async function ({ query }) {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY });
    const result = await client.search(query, {
      searchDepth: "advanced",
    });
    return JSON.stringify(result.results[0]?.content);
  },
  {
    name: "webSearch",
    description: "to search in internet",
    schema: z.object({
      query: z.string(),
    }),
  },
);

// ─── Calendar Tools ────────────────────────────────────────

const listCalendarEventsTool = tool(
  async function ({ maxResults, daysAhead }, config) {
    const refreshToken = config?.configurable?.refreshToken;
    if (!refreshToken) {
      return "Google Calendar is not connected. Please click the 'Connect Calendar' button in the header to authenticate.";
    }
    try {
      const events = await listEvents({ refreshToken, maxResults, daysAhead });
      if (events.length === 0) {
        return "No upcoming events found.";
      }
      return JSON.stringify(events, null, 2);
    } catch (err) {
      return `Error fetching calendar events: ${err.message}`;
    }
  },
  {
    name: "listCalendarEvents",
    description:
      "List upcoming events from the user's Google Calendar. Use this when the user asks about their schedule, meetings, appointments, or calendar.",
    schema: z.object({
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of events to return (default 10)"),
      daysAhead: z
        .number()
        .optional()
        .default(7)
        .describe("Number of days ahead to look for events (default 7)"),
    }),
  },
);

const createCalendarEventTool = tool(
  async function ({ summary, startDateTime, endDateTime, description, location }, config) {
    const refreshToken = config?.configurable?.refreshToken;
    if (!refreshToken) {
      return "Google Calendar is not connected. Please click the 'Connect Calendar' button in the header to authenticate.";
    }
    try {
      const result = await createEvent({ refreshToken, summary, startDateTime, endDateTime, description, location });
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error creating event: ${err.message}`;
    }
  },
  {
    name: "createCalendarEvent",
    description:
      "Create a new event on the user's Google Calendar. Use when the user wants to schedule a meeting, appointment, reminder, or any event.",
    schema: z.object({
      summary: z.string().describe("Title of the event"),
      startDateTime: z
        .string()
        .describe("Start time in ISO 8601 format, e.g. 2025-07-26T10:00:00+05:30"),
      endDateTime: z
        .string()
        .describe("End time in ISO 8601 format, e.g. 2025-07-26T11:00:00+05:30"),
      description: z
        .string()
        .optional()
        .describe("Description or notes for the event"),
      location: z
        .string()
        .optional()
        .describe("Location of the event"),
    }),
  },
);

const updateCalendarEventTool = tool(
  async function ({ eventId, summary, startDateTime, endDateTime, description, location }, config) {
    const refreshToken = config?.configurable?.refreshToken;
    if (!refreshToken) {
      return "Google Calendar is not connected. Please click the 'Connect Calendar' button in the header to authenticate.";
    }
    try {
      const result = await updateEvent({ refreshToken, eventId, summary, startDateTime, endDateTime, description, location });
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error updating event: ${err.message}`;
    }
  },
  {
    name: "updateCalendarEvent",
    description:
      "Update an existing event on the user's Google Calendar. Use when the user wants to reschedule, rename, or change details of an event. You need the event ID (get it from listCalendarEvents first).",
    schema: z.object({
      eventId: z.string().describe("The ID of the event to update (from listCalendarEvents)"),
      summary: z
        .string()
        .optional()
        .describe("New title of the event"),
      startDateTime: z
        .string()
        .optional()
        .describe("New start time in ISO 8601 format"),
      endDateTime: z
        .string()
        .optional()
        .describe("New end time in ISO 8601 format"),
      description: z
        .string()
        .optional()
        .describe("New description or notes"),
      location: z
        .string()
        .optional()
        .describe("New location"),
    }),
  },
);

const deleteCalendarEventTool = tool(
  async function ({ eventId }, config) {
    const refreshToken = config?.configurable?.refreshToken;
    if (!refreshToken) {
      return "Google Calendar is not connected. Please click the 'Connect Calendar' button in the header to authenticate.";
    }
    try {
      const result = await deleteEvent(refreshToken, eventId);
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error deleting event: ${err.message}`;
    }
  },
  {
    name: "deleteCalendarEvent",
    description:
      "Delete an event from the user's Google Calendar. Use when the user wants to cancel or remove an event. You need the event ID (get it from listCalendarEvents first).",
    schema: z.object({
      eventId: z.string().describe("The ID of the event to delete (from listCalendarEvents)"),
    }),
  },
);

const getCalendarEventTool = tool(
  async function ({ eventId }, config) {
    const refreshToken = config?.configurable?.refreshToken;
    if (!refreshToken) {
      return "Google Calendar is not connected. Please click the 'Connect Calendar' button in the header to authenticate.";
    }
    try {
      const result = await getEvent(refreshToken, eventId);
      return JSON.stringify(result, null, 2);
    } catch (err) {
      return `Error getting event details: ${err.message}`;
    }
  },
  {
    name: "getCalendarEvent",
    description:
      "Get full details of a specific calendar event including attendees. Use when the user asks for details about a particular event.",
    schema: z.object({
      eventId: z.string().describe("The ID of the event (from listCalendarEvents)"),
    }),
  },
);

const toolsList = [
  searchTool,
  listCalendarEventsTool,
  createCalendarEventTool,
  updateCalendarEventTool,
  deleteCalendarEventTool,
  getCalendarEventTool,
];
const tools = new ToolNode(toolsList);

export { tools, toolsList };