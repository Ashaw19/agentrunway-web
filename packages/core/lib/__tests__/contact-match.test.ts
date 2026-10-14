import { describe, expect, it } from "vitest";
import {
  type DeviceContact,
  type MatchableClient,
  formatBirthdate,
  isYearlessBirthdate,
  matchContactsToClients,
  phoneTypeFromLabel,
  planContactImport,
  realEstateAgentReason,
} from "../contact-match";

function contact(id: string, name: string, extra: Partial<DeviceContact> = {}): DeviceContact {
  const [firstName, ...rest] = name.split(" ");
  return { id, name, firstName, lastName: rest.join(" ") || null, phones: [], emails: [], birthday: null, ...extra };
}

function client(id: string, name: string, extra: Partial<MatchableClient> = {}): MatchableClient {
  return { id, name, phone: null, secondary_phone: null, email: null, secondary_email: null, birthdate: null, ...extra };
}

describe("matchContactsToClients — matching", () => {
  it("matches by name and proposes the missing phone, email and birthday", () => {
    const r = matchContactsToClients(
      [contact("k1", "Sam Lee", {
        phones: [{ number: "(506) 555-0101", label: "home" }, { number: "+1 506 555 0199", label: "mobile" }],
        emails: [{ email: "Sam@Example.com", label: "home" }],
        birthday: { year: 1985, month: 3, day: 21 },
      })],
      [client("c1", "Sam Lee")],
    );
    expect(r.matches).toHaveLength(1);
    const m = r.matches[0];
    expect(m.matchedBy).toBe("name");
    expect(m.updates).toEqual([
      { field: "phone", value: "+1 506 555 0199", display: "+1 506 555 0199 (mobile)", phoneType: "mobile" },
      { field: "email", value: "Sam@Example.com", display: "Sam@Example.com" },
      { field: "birthdate", value: "1985-03-21", display: "Mar 21, 1985" },
    ]);
  });

  it("ignores case, extra spaces and accents in names", () => {
    const r = matchContactsToClients(
      [contact("k1", "Zoë  Leblanc", { emails: [{ email: "z@x.ca" }] })],
      [client("c1", "zoe leblanc")],
    );
    expect(r.matches[0]?.clientId).toBe("c1");
  });

  it("prefers a phone or email match over a name match", () => {
    const r = matchContactsToClients(
      [
        contact("k1", "Sam Lee", { emails: [{ email: "other@x.ca" }] }),
        contact("k2", "Samuel Lee", { phones: [{ number: "506-555-0101" }], emails: [{ email: "sam@x.ca" }] }),
      ],
      [client("c1", "Sam Lee", { phone: "5065550101" })],
    );
    expect(r.matches[0]).toMatchObject({ contactId: "k2", matchedBy: "phone" });
    expect(r.matches[0].updates.map((u) => u.field)).toEqual(["email"]);
  });

  it("never guesses between two contacts with the client's name", () => {
    const r = matchContactsToClients(
      [contact("k1", "John Smith", { emails: [{ email: "a@x.ca" }] }), contact("k2", "John Smith", { emails: [{ email: "b@x.ca" }] })],
      [client("c1", "John Smith")],
    );
    expect(r.matches).toEqual([]);
    expect(r.ambiguous).toEqual([{ clientId: "c1", clientName: "John Smith", contactNames: ["John Smith", "John Smith"] }]);
  });

  it("never fills two clients from the one contact matched by name", () => {
    const r = matchContactsToClients(
      [contact("k1", "John Smith", { emails: [{ email: "a@x.ca" }] })],
      [client("c1", "John Smith"), client("c2", "john smith")],
    );
    expect(r.matches).toEqual([]);
    expect(r.ambiguous.map((a) => a.clientId).sort()).toEqual(["c1", "c2"]);
  });

  it("leaves clients with no matching contact alone", () => {
    const r = matchContactsToClients([contact("k1", "Pat Ng")], [client("c1", "Sam Lee")]);
    expect(r).toEqual({ matches: [], ambiguous: [], upToDate: 0 });
  });
});

describe("matchContactsToClients — only empty fields", () => {
  it("does not overwrite a phone or email; reports what Contacts has instead", () => {
    const r = matchContactsToClients(
      [contact("k1", "Sam Lee", {
        phones: [{ number: "506-555-0101" }, { number: "506-555-0777", label: "work" }],
        emails: [{ email: "new@x.ca" }],
        birthday: { month: 3, day: 21 },
      })],
      [client("c1", "Sam Lee", { phone: "506 555 0101", email: "old@x.ca" })],
    );
    const m = r.matches[0];
    expect(m.updates.map((u) => u.field)).toEqual(["birthdate"]);
    expect(m.differences).toEqual(["Contacts also has 506-555-0777", "Contacts also has new@x.ca"]);
  });

  it("counts a matched client with nothing to add as up to date", () => {
    const r = matchContactsToClients(
      [contact("k1", "Sam Lee", { phones: [{ number: "506-555-0101" }] })],
      [client("c1", "Sam Lee", { phone: "5065550101", email: "s@x.ca", birthdate: "1985-03-21" })],
    );
    expect(r.matches).toEqual([]);
    expect(r.upToDate).toBe(1);
  });

  it("reports a different birthday without changing it", () => {
    const r = matchContactsToClients(
      [contact("k1", "Sam Lee", { emails: [{ email: "s@x.ca" }], birthday: { year: 1985, month: 4, day: 2 } })],
      [client("c1", "Sam Lee", { birthdate: "1985-03-21" })],
    );
    expect(r.matches[0].updates.map((u) => u.field)).toEqual(["email"]);
    expect(r.matches[0].differences).toEqual(["Contacts has a birthday of Apr 2, 1985"]);
  });
});

describe("birthdays without a year", () => {
  it("stores the 1604 marker, shows month and day only", () => {
    const r = matchContactsToClients(
      [contact("k1", "Sam Lee", { birthday: { month: 12, day: 5 } })],
      [client("c1", "Sam Lee")],
    );
    expect(r.matches[0].updates).toEqual([{ field: "birthdate", value: "1604-12-05", display: "Dec 5" }]);
    expect(isYearlessBirthdate("1604-12-05")).toBe(true);
    expect(isYearlessBirthdate("1985-12-05")).toBe(false);
  });

  it("keeps Feb 29 without a year (1604 is a leap year) and drops impossible dates", () => {
    const leap = matchContactsToClients([contact("k1", "A B", { birthday: { month: 2, day: 29 } })], [client("c1", "A B")]);
    expect(leap.matches[0].updates[0].value).toBe("1604-02-29");
    const bad = matchContactsToClients([contact("k1", "A B", { birthday: { year: 1990, month: 2, day: 30 } })], [client("c1", "A B")]);
    expect(bad.matches).toEqual([]);
  });

  it("formats any birthdate", () => {
    expect(formatBirthdate("1985-03-21")).toBe("Mar 21, 1985");
    expect(formatBirthdate("1604-03-21")).toBe("Mar 21");
  });
});

describe("phoneTypeFromLabel", () => {
  it("reads iOS labels", () => {
    expect(phoneTypeFromLabel("iPhone")).toBe("mobile");
    expect(phoneTypeFromLabel("_$!<Mobile>!$_")).toBe("mobile");
    expect(phoneTypeFromLabel("home")).toBe("home");
    expect(phoneTypeFromLabel("work")).toBe("work");
    expect(phoneTypeFromLabel(null)).toBe("other");
  });
});

describe("planContactImport", () => {
  it("imports a contact no client shares a phone, email or name with", () => {
    const r = planContactImport(
      [contact("k1", "Pat Ng", {
        phones: [{ number: "506-555-0100", label: "home" }, { number: "506-555-0199", label: "iPhone" }],
        emails: [{ email: "pat@x.ca" }],
        birthday: { month: 6, day: 2 },
      })],
      [client("c1", "Sam Lee", { phone: "5065550101", email: "sam@x.ca" })],
    );
    expect(r.candidates).toEqual([{
      contactId: "k1", agentReason: null, name: "Pat Ng", first_name: "Pat", last_name: "Ng",
      phone: "506-555-0199", phone_type: "mobile", secondary_phone: "506-555-0100", secondary_phone_type: "home",
      email: "pat@x.ca", secondary_email: null, birthdate: "1604-06-02", kind: "person",
    }]);
    expect(r.alreadyThere).toBe(0);
  });

  it("skips a contact that shares a phone, an email or a name with any client", () => {
    const r = planContactImport(
      [
        contact("k1", "Samuel Lee", { phones: [{ number: "+1 506 555 0101" }] }),
        contact("k2", "Other Name", { emails: [{ email: "SAM@x.ca" }] }),
        contact("k3", "Zoë Leblanc"),
        contact("k4", "New Person", { phones: [{ number: "506-555-0300" }] }),
      ],
      [
        client("c1", "Sam Lee", { phone: "5065550101", email: "sam@x.ca" }),
        client("c2", "zoe leblanc"),
      ],
    );
    expect(r.candidates.map((c) => c.contactId)).toEqual(["k4"]);
    expect(r.alreadyThere).toBe(3);
  });

  it("imports one copy of a contact listed twice, and skips contacts with no name", () => {
    const r = planContactImport(
      [
        contact("k1", "Pat Ng", { phones: [{ number: "506-555-0100" }] }),
        contact("k2", "Pat Ng", { phones: [{ number: "5065550100" }] }),
        { id: "k3", name: "", phones: [{ number: "506-555-0400" }], emails: [] },
      ],
      [],
    );
    expect(r.candidates.map((c) => c.contactId)).toEqual(["k1"]);
    expect(r.duplicates).toBe(1);
    expect(r.noName).toBe(1);
  });

  it("names a business by its company, and flags name-only contacts", () => {
    const r = planContactImport(
      [
        { id: "k1", name: "", company: "Bay Plumbing", isCompany: true, phones: [{ number: "506-555-0500", label: "work" }], emails: [] },
        contact("k2", "Just Aname"),
      ],
      [],
    );
    expect(r.candidates.map((c) => [c.name, c.kind, c.first_name])).toEqual([
      ["Bay Plumbing", "business", null],
      ["Just Aname", "name_only", "Just"],
    ]);
  });

  it("caps a name at the 200 characters the database allows", () => {
    const r = planContactImport([contact("k1", "A".repeat(250), { emails: [{ email: "a@x.ca" }] })], []);
    expect(r.candidates[0].name).toHaveLength(200);
  });
});

describe("realEstateAgentReason", () => {
  const person = (extra: Partial<DeviceContact>) => contact("k1", "Jane Smith", extra);

  it("flags brokerage brands in the company, however they're written", () => {
    for (const company of ["RE/MAX Professionals", "Royal LePage Atlantic", "Century 21 Colonial", "Keller Williams Capital",
      "eXp Realty", "Coldwell Banker Select", "Sutton Group", "REAL Broker", "EXIT Realty Advantage", "Sotheby\u2019s International",
      "Engel & Völkers"]) {
      expect(realEstateAgentReason(person({ company }))).toBe(`Company: ${company}`);
    }
  });

  it("flags agent job titles and names saved with REALTOR", () => {
    expect(realEstateAgentReason(person({ jobTitle: "REALTOR®" }))).toBe("Job title: REALTOR®");
    expect(realEstateAgentReason(person({ jobTitle: "Broker of Record" }))).toBe("Job title: Broker of Record");
    expect(realEstateAgentReason(contact("k1", "Jane Smith Realtor"))).toBe("Name: Jane Smith Realtor");
    expect(realEstateAgentReason(contact("k1", "Jane (RE/MAX)"))).toBe("Name: Jane (RE/MAX)");
  });

  it("flags brokerage email domains", () => {
    expect(realEstateAgentReason(person({ emails: [{ email: "jane@remax.ca" }] }))).toBe("Email: @remax.ca");
    expect(realEstateAgentReason(person({ emails: [{ email: "jane@kw.com" }] }))).toBe("Email: @kw.com");
    expect(realEstateAgentReason(person({ emails: [{ email: "jane@smithrealty.ca" }] }))).toBe("Email: @smithrealty.ca");
  });

  it("leaves referral partners and everyone else alone", () => {
    for (const extra of [
      { company: "Smith Real Estate Law" }, { jobTitle: "Mortgage Broker" }, { company: "Atlantic Home Inspections" },
      { company: "Royal Bank" }, { jobTitle: "Insurance Broker" }, { company: "Irving Oil" }, {},
    ] as Partial<DeviceContact>[]) {
      expect(realEstateAgentReason(person(extra))).toBeNull();
    }
    // A surname is not a brokerage.
    expect(realEstateAgentReason(contact("k1", "Pat Sutton"))).toBeNull();
    expect(realEstateAgentReason(person({ emails: [{ email: "jane@gmail.com" }] }))).toBeNull();
  });

  it("marks agents in the import plan", () => {
    const r = planContactImport(
      [contact("k1", "Jane Smith", { company: "Royal LePage" }), contact("k2", "Pat Ng", { emails: [{ email: "pat@x.ca" }] })],
      [],
    );
    expect(r.candidates.map((x) => [x.name, x.agentReason])).toEqual([
      ["Jane Smith", "Company: Royal LePage"],
      ["Pat Ng", null],
    ]);
  });
});
