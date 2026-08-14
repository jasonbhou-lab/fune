import React, { useRef, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { Screen, TextField, PrimaryButton, CheckboxRow, Banner } from "../../components/ui";
import { Chip } from "../../components/ui";
import { api } from "../../api";
import { useAppState } from "../../context/AppState";
import { colors, spacing, type } from "../../theme";

const CONTACT_METHODS = [
  { id: "call", label: "Call" },
  { id: "text", label: "Text" },
  { id: "email", label: "Email" },
];

export default function LeadFormScreen({ navigation, route }) {
  const { locationId, offeringId, providerName } = route.params;
  const { needType, consumerToken, clearCompare } = useAppState();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactMethod, setContactMethod] = useState("call");
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const clientRequestId = useRef(`${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const validate = () => {
    const e = {};
    if (!firstName.trim()) e.firstName = "First name is required.";
    if (!lastName.trim()) e.lastName = "Last name is required.";
    if (!contact.trim()) e.contact = "Enter a valid phone number or email.";
    if (!consent) e.consent = "Consent to contact is required to submit a request.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setServerError(null);
    const isEmail = contact.includes("@");
    try {
      const res = await api.submitLead(
        {
          locationId,
          offeringId,
          firstName,
          lastName,
          contactMethod,
          phone: isEmail ? null : contact,
          email: isEmail ? contact : null,
          needType,
          message,
          consentToContact: consent,
          marketingOptIn: marketing,
          clientRequestId: clientRequestId.current,
        },
        consumerToken
      );
      clearCompare();
      navigation.replace("Confirmation", { leadId: res.leadId, providerName: res.providerName });
    } catch (e) {
      setServerError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Text style={[type.label, { marginBottom: spacing.md }]}>Request pricing · {providerName}</Text>

        {serverError ? <Banner tone="danger">Couldn't send your request. {serverError}</Banner> : null}

        <TextField label="First name" value={firstName} onChangeText={setFirstName} error={errors.firstName} />
        <TextField label="Last name" value={lastName} onChangeText={setLastName} error={errors.lastName} />

        <Text style={[type.label, { marginBottom: 6 }]}>Preferred contact method</Text>
        <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
          {CONTACT_METHODS.map((m) => (
            <Chip key={m.id} label={m.label} active={contactMethod === m.id} onPress={() => setContactMethod(m.id)} />
          ))}
        </View>

        <TextField
          label="Phone or email"
          value={contact}
          onChangeText={setContact}
          error={errors.contact}
          placeholder="you@example.com"
        />

        <TextField label="Message (optional)" value={message} onChangeText={setMessage} placeholder="Anything you'd like the provider to know" />

        <CheckboxRow
          label="I consent to this provider contacting me about this request."
          checked={consent}
          onToggle={() => setConsent((v) => !v)}
        />
        {errors.consent ? <Text style={{ color: colors.danger, fontSize: 11, marginBottom: spacing.sm }}>{errors.consent}</Text> : null}
        <CheckboxRow
          label="Send me planning resources and offers (optional)."
          checked={marketing}
          onToggle={() => setMarketing((v) => !v)}
        />

        <PrimaryButton title="Send request" onPress={submit} loading={submitting} style={{ marginTop: spacing.md, marginBottom: spacing.xl }} />
      </ScrollView>
    </Screen>
  );
}
