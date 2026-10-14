/**
 * Reading the iPhone's address book (expo-contacts), for Fill in from
 * Contacts and Import from Contacts. Contacts are read on the phone and
 * mapped to core's DeviceContact; nothing here sends them anywhere.
 */
import { Alert, Linking } from "react-native";
import * as Contacts from "expo-contacts";
import type { DeviceContact } from "@agent-runway/core/lib/contact-match";

function toDeviceContact(c: Contacts.ExistingContact): DeviceContact | null {
  if (!c.id) return null;
  const name = (c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" ")).trim();
  const b = c.birthday;
  return {
    id: c.id,
    name,
    company: c.company ?? null,
    isCompany: c.contactType === Contacts.ContactTypes.Company,
    firstName: c.firstName ?? null,
    lastName: c.lastName ?? null,
    phones: (c.phoneNumbers ?? []).filter((p) => p.number).map((p) => ({ number: p.number!, label: p.label ?? null })),
    emails: (c.emails ?? []).filter((e) => e.email).map((e) => ({ email: e.email!, label: e.label ?? null })),
    // expo-contacts months start at 0, like JavaScript Dates.
    birthday: b && typeof b.month === "number" && typeof b.day === "number"
      ? { month: b.month + 1, day: b.day, year: b.year ?? null }
      : null,
  };
}

/**
 * Asks for access (once; iOS remembers) and returns every contact, or null
 * when access is refused, after offering the Settings app.
 */
export async function readDeviceContacts(reason: string): Promise<DeviceContact[] | null> {
  const perm = await Contacts.requestPermissionsAsync();
  if (perm.status !== "granted") {
    Alert.alert("Contacts Access Needed", reason, [
      { text: "Not Now", style: "cancel" },
      { text: "Open Settings", onPress: () => void Linking.openSettings() },
    ]);
    return null;
  }
  const { data } = await Contacts.getContactsAsync({
    fields: [
      Contacts.Fields.Name,
      Contacts.Fields.FirstName,
      Contacts.Fields.LastName,
      Contacts.Fields.Company,
      Contacts.Fields.ContactType,
      Contacts.Fields.PhoneNumbers,
      Contacts.Fields.Emails,
      Contacts.Fields.Birthday,
    ],
  });
  return data.map(toDeviceContact).filter((d): d is DeviceContact => d !== null);
}
