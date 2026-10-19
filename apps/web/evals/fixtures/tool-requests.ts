/**
 * Realistic requests in Andrew's style for the tool-selection eval, each with
 * the persona the router sends it to and the tools a correct first step may
 * call. Names, addresses and amounts are made up.
 *
 * `first`: the model's first tool call must be one of these. Search-first is
 * correct for anything that names a record (the tool descriptions say to
 * search before writing). `none: true` means answering without a tool is
 * also correct.
 *
 * To add a case: append a row. Keep requests short and plain, the way
 * they're typed on a phone between showings.
 */
export type EvalPersona = "captain" | "navigator" | "dispatcher";

export interface ToolRequestCase {
  persona: EvalPersona;
  request: string;
  first: string[];
  none?: boolean;
}

export const TOOL_REQUESTS: ToolRequestCase[] = [
  // ── Dispatcher: clients, pipeline, activities, drafts ─────────────────────
  { persona: "dispatcher", request: "log a call with Sam Example, talked about listing in the spring", first: ["searchClients", "logContactActivity"] },
  { persona: "dispatcher", request: "new buyer lead Jordan Sample, budget around 450k, wants Rothesay", first: ["searchClients", "createClient"] },
  { persona: "dispatcher", request: "who haven't I talked to in a while", first: ["searchClientsByFilter", "searchClients"] },
  { persona: "dispatcher", request: "move the 12 Example St deal to conditional", first: ["searchPipelineDeals", "updatePipelineDealStage"] },
  { persona: "dispatcher", request: "remind me to call Pat Example on Friday", first: ["searchClients", "createContactTask"] },
  { persona: "dispatcher", request: "draft a check-in email for Sam Example", first: ["searchClients", "draftOutreachForClient"] },
  { persona: "dispatcher", request: "text Sam Example and Pat Example to check in", first: ["searchClients", "draftClientTexts"] },
  { persona: "dispatcher", request: "what's in my pipeline right now", first: ["searchPipelineDeals", "getQuickStats"] },
  { persona: "dispatcher", request: "tag Sam Example as an investor", first: ["searchClients", "updateClientTags"] },
  { persona: "dispatcher", request: "Pat Example likes it casual, set her tone to casual", first: ["searchClients", "updateClientTone"] },
  { persona: "dispatcher", request: "write a listing description for 44 Sample Ave, 3 bed 2 bath bungalow with a new roof", first: ["draftListingDescription"] },
  { persona: "dispatcher", request: "pull up everything on Pat Example", first: ["searchClients", "getClientSummary"] },
  { persona: "dispatcher", request: "the listing appointment at 9 Demo Rd went well, we got the listing", first: ["searchListingAppointments", "updateListingAppointment"] },
  { persona: "dispatcher", request: "Sam Example referred Jordan Sample to me, link them", first: ["searchClients", "linkClientReferral"] },
  { persona: "dispatcher", request: "what did you change today", first: ["getAIActivity"] },
  { persona: "dispatcher", request: "undo that last change, I didn't mean that client", first: ["getAIActivity", "undoAIChange"] },

  // ── Navigator: money, expenses, mileage, tax settings ─────────────────────
  { persona: "navigator", request: "spent $62.40 at Esso on gas today", first: ["logExpense"] },
  { persona: "navigator", request: "drove 48 km to a showing in Quispamsis yesterday", first: ["logMileage"] },
  { persona: "navigator", request: "I pay $29 a month for Canva", first: ["createRecurringExpense", "searchRecurringExpenses"] },
  { persona: "navigator", request: "Canva stopped at the end of September", first: ["searchRecurringExpenses", "updateRecurringExpense"] },
  { persona: "navigator", request: "my Canva subscription has $3.77 HST in each charge", first: ["searchRecurringExpenses", "updateRecurringExpense"] },
  { persona: "navigator", request: "my MLS dues went up to $95 a month", first: ["searchRecurringExpenses", "updateRecurringExpense"] },
  { persona: "navigator", request: "how much have I spent on client meals this year", first: ["searchExpenses", "getQuickStats"] },
  { persona: "navigator", request: "record the sale of 12 Example St, closed Oct 3 at $410,000, 2.5% commission, buyer side, client Sam Example", first: ["recordTransaction", "searchTransactions"] },
  { persona: "navigator", request: "the Example St deal was actually 415k, fix it", first: ["searchTransactions", "updateTransaction"] },
  { persona: "navigator", request: "delete the duplicate Staples expense from Tuesday", first: ["searchExpenses"] },
  { persona: "navigator", request: "bought a new laptop for the business, $1,899", first: ["addCCAAsset", "logExpense"] },
  { persona: "navigator", request: "switch me to the cash method for reporting commission income", first: ["updateIncomeReportingMethod"] },
  { persona: "navigator", request: "how many deals have I closed this year", first: ["getQuickStats", "searchTransactions"] },
  { persona: "navigator", request: "how much is the AI costing me this month", first: ["getAIActivity"] },
  { persona: "navigator", request: "did that expense save?", first: ["getAIActivity", "searchExpenses"] },

  // ── Captain: overview, broadcast drafts ───────────────────────────────────
  { persona: "captain", request: "how's my year going", first: ["getQuickStats"], none: true },
  { persona: "captain", request: "draft my October newsletter", first: ["draftNewsletter"] },
  { persona: "captain", request: "write an Instagram post about my recent sale on Example St", first: ["draftSocialPost"] },
  { persona: "captain", request: "did Flight Crew change anything today", first: ["getAIActivity"] },
];
