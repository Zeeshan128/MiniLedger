import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Platform,
  Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View
} from "react-native";
import { StatusBar } from "expo-status-bar";

type Loan = {
  id: number;
  friendName: string;
  amount: number;
  dueDate: string;
  status: "unpaid" | "repaid";
  createdAt: string;
  repaidAt?: string | null;
  overdue?: boolean;
};
type Summary = {
  totalLent: number;
  totalRepaid: number;
  overdueAmount: number;
  outstandingAmount: number;
  activeLoans: number;
};

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:4000").replace(/\/$/, "");
const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function api<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(`Cannot reach the API at ${API_URL}. Check that the backend is running and the phone and computer are on the same network.`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export default function App() {
  const [token, setToken] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<Summary>({
    totalLent: 0, totalRepaid: 0, overdueAmount: 0, outstandingAmount: 0, activeLoans: 0
  });
  const [showForm, setShowForm] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayISO());

  const refresh = useCallback(async (authToken = token) => {
    if (!authToken) return;
    const [loanData, summaryData] = await Promise.all([
      api<{ loans: Loan[] }>("/loans", authToken),
      api<Summary>("/summary", authToken)
    ]);
    setLoans(loanData.loans);
    setSummary(summaryData);
  }, [token]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      refresh(token).catch(e => Alert.alert("Could not load data", e.message))
        .finally(() => setLoading(false));
    }
  }, [token, refresh]);

  const sendOtp = async () => {
    const cleaned = phone.trim();
    if (!/^\+?[1-9]\d{7,14}$/.test(cleaned)) {
      Alert.alert("Check phone number", "Enter 8–15 digits, optionally starting with + and a country code.");
      return;
    }
    setLoading(true);
    try {
      await api("/auth/send-otp", undefined, { method: "POST", body: JSON.stringify({ phone: cleaned }) });
      setOtpSent(true);
      Alert.alert("Mock OTP sent", "For this assignment, read the 6-digit OTP in the backend terminal.");
    } catch (e) {
      Alert.alert("Could not send OTP", (e as Error).message);
    } finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    if (!/^\d{6}$/.test(otp.trim())) {
      Alert.alert("Invalid OTP", "Enter the 6-digit OTP printed by the backend.");
      return;
    }
    setLoading(true);
    try {
      const result = await api<{ token: string }>("/auth/verify-otp", undefined, {
        method: "POST", body: JSON.stringify({ phone: phone.trim(), otp: otp.trim() })
      });
      setToken(result.token);
    } catch (e) {
      Alert.alert("Login failed", (e as Error).message);
    } finally { setLoading(false); }
  };

  const addLoan = async () => {
    const parsedAmount = Number(amount);
    if (!friendName.trim()) return Alert.alert("Missing name", "Enter your friend's name.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return Alert.alert("Invalid amount", "Enter an amount greater than zero.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(`${dueDate}T00:00:00`).getTime())) {
      return Alert.alert("Invalid date", "Enter the due date as YYYY-MM-DD.");
    }
    setLoading(true);
    try {
      await api("/loans", token, {
        method: "POST",
        body: JSON.stringify({ friendName: friendName.trim(), amount: parsedAmount, dueDate })
      });
      setFriendName(""); setAmount(""); setDueDate(todayISO()); setShowForm(false);
      await refresh();
    } catch (e) { Alert.alert("Could not add loan", (e as Error).message); }
    finally { setLoading(false); }
  };

  const repay = (loan: Loan) => {
    Alert.alert("Mark as repaid?", `Confirm that ${loan.friendName} has repaid ${money(loan.amount)}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Mark repaid", onPress: async () => {
        setLoading(true);
        try {
          await api(`/loans/${loan.id}/repay`, token, { method: "PATCH" });
          await refresh();
        } catch (e) { Alert.alert("Could not update loan", (e as Error).message); }
        finally { setLoading(false); }
      }}
    ]);
  };

  if (!token) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.loginCard}>
            <View style={styles.logo}><Text style={styles.logoText}>M</Text></View>
            <Text style={styles.brand}>MiniLedger</Text>
            <Text style={styles.subtitle}>A simpler way to keep track of money lent to friends.</Text>
            <Text style={styles.label}>PHONE NUMBER</Text>
            <TextInput
              value={phone} onChangeText={setPhone} keyboardType="phone-pad"
              placeholder="+91 9876543210" placeholderTextColor="#9AA49E"
              style={styles.input} editable={!otpSent} autoCapitalize="none"
            />
            {otpSent && <>
              <Text style={styles.label}>6-DIGIT OTP</Text>
              <TextInput value={otp} onChangeText={setOtp} keyboardType="number-pad"
                placeholder="Enter OTP from server log" placeholderTextColor="#9AA49E"
                style={styles.input} maxLength={6} />
            </>}
            <Pressable style={[styles.primaryButton, loading && styles.disabled]} onPress={otpSent ? verifyOtp : sendOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{otpSent ? "Verify and continue" : "Send mock OTP"}</Text>}
            </Pressable>
            {otpSent && <Pressable onPress={() => { setOtpSent(false); setOtp(""); }} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Change phone number</Text>
            </Pressable>}
            <Text style={styles.demoNote}>Demo authentication · OTP appears in backend terminal</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerEyebrow}>YOUR PERSONAL FINANCE</Text>
          <Text style={styles.headerTitle}>MiniLedger</Text>
        </View>
        <Pressable onPress={() => { setToken(""); setOtp(""); setOtpSent(false); }} style={styles.logout}>
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </View>
      <FlatList
        data={loans}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryEyebrow}>TOTAL LENT</Text>
              <Text style={styles.summaryTotal}>{money(summary.totalLent)}</Text>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={styles.summarySmall}>
                  <Text style={styles.summarySmallLabel}>Repaid</Text>
                  <Text style={styles.summarySmallValue}>{money(summary.totalRepaid)}</Text>
                </View>
                <View style={styles.summarySmall}>
                  <Text style={styles.summarySmallLabel}>Overdue</Text>
                  <Text style={[styles.summarySmallValue, { color: "#FFB6A9" }]}>{money(summary.overdueAmount)}</Text>
                </View>
              </View>
              <Text style={styles.outstanding}>Outstanding: {money(summary.outstandingAmount)}</Text>
            </View>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.sectionTitle}>Your loans</Text>
                <Text style={styles.sectionSub}>{loans.length} {loans.length === 1 ? "entry" : "entries"} · {summary.activeLoans} unpaid</Text>
              </View>
              <Pressable style={styles.addButton} onPress={() => setShowForm(v => !v)}>
                <Text style={styles.addButtonText}>{showForm ? "Cancel" : "+ Add loan"}</Text>
              </Pressable>
            </View>
            {showForm && <View style={styles.formCard}>
              <Text style={styles.formTitle}>New loan entry</Text>
              <Text style={styles.label}>FRIEND'S NAME</Text>
              <TextInput value={friendName} onChangeText={setFriendName} placeholder="e.g. Asha" placeholderTextColor="#9AA49E" style={styles.input} maxLength={100} />
              <Text style={styles.label}>AMOUNT (₹)</Text>
              <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 1500" placeholderTextColor="#9AA49E" style={styles.input} />
              <Text style={styles.label}>DUE DATE (YYYY-MM-DD)</Text>
              <TextInput value={dueDate} onChangeText={setDueDate} placeholder="2026-12-31" placeholderTextColor="#9AA49E" style={styles.input} autoCapitalize="none" />
              <Pressable style={[styles.primaryButton, loading && styles.disabled]} onPress={addLoan} disabled={loading}>
                <Text style={styles.primaryButtonText}>{loading ? "Saving..." : "Save loan"}</Text>
              </Pressable>
            </View>}
            <Text style={styles.listTitle}>RECENT ENTRIES</Text>
          </View>
        }
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>No loans yet</Text><Text style={styles.emptyText}>Add your first entry to start tracking money lent.</Text></View>}
        renderItem={({ item }) => {
          const overdue = item.status === "unpaid" && (item.overdue ?? item.dueDate.slice(0, 10) < todayISO());
          return <View style={[styles.loanCard, overdue && styles.overdueCard]}>
            <View style={styles.loanTop}>
              <View style={[styles.avatar, overdue && styles.overdueAvatar]}><Text style={styles.avatarText}>{item.friendName.trim().charAt(0).toUpperCase()}</Text></View>
              <View style={styles.loanPerson}>
                <Text style={styles.friendName}>{item.friendName}</Text>
                <Text style={styles.dueText}>Due {item.dueDate.slice(0, 10)}</Text>
              </View>
              <View style={styles.amountWrap}>
                <Text style={styles.loanAmount}>{money(item.amount)}</Text>
                <View style={[styles.statusPill, overdue ? styles.overduePill : item.status === "repaid" ? styles.repaidPill : styles.pendingPill]}>
                  <Text style={[styles.statusText, overdue && { color: "#B42318" }]}>
                    {item.status === "repaid" ? "Repaid" : overdue ? "Overdue" : "Unpaid"}
                  </Text>
                </View>
              </View>
            </View>
            {item.status === "unpaid" && <Pressable style={styles.repayButton} onPress={() => repay(item)}>
              <Text style={styles.repayButtonText}>Mark as repaid ✓</Text>
            </Pressable>}
          </View>;
        }}
        refreshing={loading}
        onRefresh={() => refresh().catch(e => Alert.alert("Refresh failed", e.message))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7F5" },
  center: { flex: 1, justifyContent: "center", padding: 22 },
  loginCard: { backgroundColor: "#FFFFFF", borderRadius: 26, padding: 25, shadowColor: "#193B2B", shadowOpacity: 0.08, shadowRadius: 22, elevation: 4 },
  logo: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#16794B", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  logoText: { color: "#FFFFFF", fontWeight: "900", fontSize: 28 },
  brand: { fontSize: 30, fontWeight: "800", color: "#173B2C", letterSpacing: -0.8 },
  subtitle: { fontSize: 14, color: "#6B7A72", lineHeight: 21, marginTop: 8, marginBottom: 28 },
  label: { color: "#607168", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#DCE5DF", borderRadius: 12, backgroundColor: "#FBFCFB", paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: "#183B2C" },
  primaryButton: { backgroundColor: "#16794B", borderRadius: 12, padding: 15, alignItems: "center", justifyContent: "center", marginTop: 20, minHeight: 50 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  textButton: { alignItems: "center", padding: 13 },
  textButtonLabel: { color: "#16794B", fontWeight: "700" },
  demoNote: { textAlign: "center", color: "#87948D", fontSize: 11, marginTop: 18 },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerEyebrow: { color: "#819087", fontSize: 9, letterSpacing: 1.5, fontWeight: "800" },
  headerTitle: { color: "#173B2C", fontSize: 26, fontWeight: "800", marginTop: 3 },
  logout: { borderWidth: 1, borderColor: "#DCE5DF", borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  logoutText: { color: "#52665B", fontWeight: "700", fontSize: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 28 },
  summaryCard: { backgroundColor: "#173B2C", borderRadius: 22, padding: 21, marginTop: 8, marginBottom: 22 },
  summaryEyebrow: { color: "#B4D4C2", fontSize: 10, letterSpacing: 1.5, fontWeight: "800" },
  summaryTotal: { color: "#FFFFFF", fontSize: 35, fontWeight: "800", letterSpacing: -1, marginTop: 7 },
  summaryDivider: { height: 1, backgroundColor: "#3B5D4D", marginVertical: 18 },
  summaryRow: { flexDirection: "row", gap: 20 },
  summarySmall: { flex: 1 },
  summarySmallLabel: { color: "#B4D4C2", fontSize: 12, marginBottom: 5 },
  summarySmallValue: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  outstanding: { color: "#D0E3D7", fontSize: 12, marginTop: 16 },
  sectionHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { color: "#173B2C", fontSize: 21, fontWeight: "800" },
  sectionSub: { color: "#7C8A82", fontSize: 12, marginTop: 4 },
  addButton: { backgroundColor: "#16794B", borderRadius: 11, paddingHorizontal: 14, paddingVertical: 11 },
  addButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  formCard: { backgroundColor: "#FFFFFF", padding: 17, borderRadius: 18, marginBottom: 22, borderWidth: 1, borderColor: "#E5ECE7" },
  formTitle: { color: "#173B2C", fontSize: 17, fontWeight: "800", marginBottom: 6 },
  listTitle: { color: "#819087", fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 11 },
  empty: { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 25, alignItems: "center", marginTop: 4 },
  emptyTitle: { color: "#173B2C", fontSize: 16, fontWeight: "800" },
  emptyText: { color: "#7C8A82", fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 20 },
  loanCard: { backgroundColor: "#FFFFFF", borderRadius: 17, padding: 15, marginBottom: 11, borderWidth: 1, borderColor: "#E6ECE8" },
  overdueCard: { backgroundColor: "#FFF9F8", borderColor: "#F1B7B0", borderLeftWidth: 4, borderLeftColor: "#D92D20" },
  loanTop: { flexDirection: "row", alignItems: "center" },
  avatar: { width: 43, height: 43, borderRadius: 14, backgroundColor: "#DDF1E5", alignItems: "center", justifyContent: "center" },
  overdueAvatar: { backgroundColor: "#FDE2DE" },
  avatarText: { color: "#16794B", fontSize: 17, fontWeight: "800" },
  loanPerson: { flex: 1, marginLeft: 11 },
  friendName: { color: "#173B2C", fontSize: 15, fontWeight: "800" },
  dueText: { color: "#87948D", fontSize: 11, marginTop: 5 },
  amountWrap: { alignItems: "flex-end" },
  loanAmount: { color: "#173B2C", fontSize: 16, fontWeight: "800" },
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4, marginTop: 6 },
  overduePill: { backgroundColor: "#FEE4E2" },
  repaidPill: { backgroundColor: "#DDF5E7" },
  pendingPill: { backgroundColor: "#FFF0C2" },
  statusText: { color: "#496255", fontSize: 10, fontWeight: "800" },
  repayButton: { alignSelf: "flex-end", marginTop: 12, borderWidth: 1, borderColor: "#B9DCC8", borderRadius: 9, paddingHorizontal: 12, paddingVertical: 8 },
  repayButtonText: { color: "#16794B", fontSize: 12, fontWeight: "700" }
});
