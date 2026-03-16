import React, { useState, useCallback } from "react";
import {
  startRegistration,
  startAuthentication,
} from "@simplewebauthn/browser";
import { FlowDiagram } from "./FlowDiagram";
import { StepPanel } from "./StepPanel";
import { CryptoDetails } from "./CryptoDetails";
import "./styles.css";

export type Mode = "passkey" | "hardware";

export interface FlowStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "active" | "done" | "error";
  data?: any;
  details?: string;
}

const initialRegSteps: FlowStep[] = [
  {
    id: "reg-1",
    title: "1. Заявка за регистрация",
    description: "Браузърът изпраща потребителско име към сървъра",
    status: "pending",
  },
  {
    id: "reg-2",
    title: "2. Генериране на Challenge",
    description:
      "Сървърът създава случаен challenge и опции за PublicKeyCredential",
    status: "pending",
  },
  {
    id: "reg-3",
    title: "3. Създаване на ключова двойка",
    description:
      "Автентикаторът генерира нова двойка публичен/частен ключ и подписва challenge",
    status: "pending",
  },
  {
    id: "reg-4",
    title: "4. Верификация от сървъра",
    description:
      "Сървърът проверява подписа, attestation обекта и записва публичния ключ",
    status: "pending",
  },
];

const initialAuthSteps: FlowStep[] = [
  {
    id: "auth-1",
    title: "1. Заявка за вход",
    description: "Браузърът изпраща заявка за автентикация към сървъра",
    status: "pending",
  },
  {
    id: "auth-2",
    title: "2. Генериране на Challenge",
    description:
      "Сървърът създава нов challenge и списък с позволени credentials",
    status: "pending",
  },
  {
    id: "auth-3",
    title: "3. Подписване с частен ключ",
    description:
      "Автентикаторът подписва challenge с частния ключ за тази релация",
    status: "pending",
  },
  {
    id: "auth-4",
    title: "4. Проверка на подписа",
    description:
      "Сървърът верифицира подписа с публичния ключ и увеличава брояча",
    status: "pending",
  },
];

function base64urlToHex(b64url: string): string {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    return Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("");
  } catch {
    return "(невалиден base64url)";
  }
}

function decodeClientDataJSON(cdj: string): any {
  try {
    const b64 = cdj.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    return JSON.parse(atob(b64 + pad));
  } catch {
    return null;
  }
}

function parseAuthenticatorData(authDataB64url: string) {
  try {
    const b64 = authDataB64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    const rpIdHash = Array.from(bytes.slice(0, 32), (b) =>
      b.toString(16).padStart(2, "0")
    ).join("");
    const flags = bytes[32];
    const counter =
      (bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36];

    return {
      rpIdHash,
      flags: {
        byte: "0x" + flags.toString(16).padStart(2, "0"),
        binary: flags.toString(2).padStart(8, "0"),
        UP: !!(flags & 0x01),
        UV: !!(flags & 0x04),
        BE: !!(flags & 0x08),
        BS: !!(flags & 0x10),
        AT: !!(flags & 0x40),
        ED: !!(flags & 0x80),
      },
      counter,
      rawLength: bytes.length,
    };
  } catch {
    return null;
  }
}

export function App() {
  const [mode, setMode] = useState<Mode>("passkey");
  const [username, setUsername] = useState("");
  const [regSteps, setRegSteps] = useState<FlowStep[]>(initialRegSteps);
  const [authSteps, setAuthSteps] = useState<FlowStep[]>(initialAuthSteps);
  const [activeFlow, setActiveFlow] = useState<"none" | "register" | "login">(
    "none"
  );
  const [cryptoLog, setCryptoLog] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "info">(
    "info"
  );

  const addCryptoLog = useCallback((entry: any) => {
    setCryptoLog((prev) => [...prev, { ...entry, timestamp: Date.now() }]);
  }, []);

  const updateStep = (
    setter: React.Dispatch<React.SetStateAction<FlowStep[]>>,
    stepId: string,
    updates: Partial<FlowStep>
  ) => {
    setter((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, ...updates } : s))
    );
  };

  const resetSteps = (
    setter: React.Dispatch<React.SetStateAction<FlowStep[]>>,
    initial: FlowStep[]
  ) => {
    setter(initial.map((s) => ({ ...s, status: "pending", data: undefined })));
  };

  const handleRegister = async () => {
    if (!username.trim()) {
      setStatusMessage("Моля, въведете потребителско име");
      setStatusType("error");
      return;
    }

    setActiveFlow("register");
    setCryptoLog([]);
    resetSteps(setRegSteps, initialRegSteps);

    try {
      // Step 1: Send request
      updateStep(setRegSteps, "reg-1", { status: "active" });
      addCryptoLog({
        step: "Заявка за регистрация",
        icon: "arrow_right",
        description:
          "Браузърът изпраща потребителското име и избрания режим към сървъра. Сървърът ще генерира криптографски challenge — случайна стойност, която автентикаторът трябва да подпише, за да докаже, че притежава частния ключ.",
        data: {
          username,
          mode,
        },
      });
      await new Promise((r) => setTimeout(r, 500));
      updateStep(setRegSteps, "reg-1", {
        status: "done",
        data: { username, mode },
      });

      // Step 2: Get options from server
      updateStep(setRegSteps, "reg-2", { status: "active" });
      const optRes = await fetch("/api/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, mode }),
      });
      const { options, debug: serverDebug } = await optRes.json();

      addCryptoLog({
        step: "Challenge от сървъра",
        icon: "server",
        description:
          "Сървърът генерира случаен challenge (минимум 16 байта) и го изпраща заедно с параметрите на Relying Party (RP). Challenge-ът е еднократна стойност (nonce), която предотвратява replay атаки — всеки опит за регистрация използва нов challenge. RP ID е домейнът на сайта, а RP Name е четимото му име.",
        data: {
          "Challenge (base64url)": serverDebug.challengeBase64url,
          "Challenge (hex)": serverDebug.challengeHex,
          "RP ID": serverDebug.rpID,
          "RP Name": serverDebug.rpName,
          "Attestation тип": serverDebug.attestationType,
          "Resident Key": serverDebug.residentKey,
          "User Verification": serverDebug.userVerification,
          "Authenticator Attachment": serverDebug.authenticatorAttachment,
        },
      });

      updateStep(setRegSteps, "reg-2", {
        status: "done",
        data: serverDebug,
      });

      // Step 3: Create credential (browser + authenticator)
      updateStep(setRegSteps, "reg-3", { status: "active" });
      addCryptoLog({
        step: "Извикване на navigator.credentials.create()",
        icon: "key",
        description:
          "Браузърът извиква WebAuthn API-то с получените опции. Операционната система показва системен диалог за биометрична верификация или PIN. Автентикаторът (вграден чип, USB ключ и др.) генерира нова асиметрична двойка ключове (ECDSA P-256, Ed25519 или RSA). Частният ключ никога не напуска автентикатора — той остава защитен в хардуера.",
        data: {
          publicKey_rp: options.rp,
          publicKey_user: { name: options.user.name, id: "(base64url)" },
          publicKey_challenge: options.challenge,
          publicKey_pubKeyCredParams: options.pubKeyCredParams,
        },
      });

      const attResp = await startRegistration({ optionsJSON: options });

      // Parse the response
      const clientData = decodeClientDataJSON(attResp.response.clientDataJSON);
      const authData = parseAuthenticatorData(
        attResp.response.authenticatorData || ""
      );

      addCryptoLog({
        step: "Отговор от автентикатора",
        icon: "shield",
        description:
          "Автентикаторът връща attestation обект, съдържащ новия публичен ключ и подпис, доказващ произхода на ключа. clientDataJSON съдържа challenge-а и origin-а, подписани от автентикатора. authenticatorData е бинарна структура с: SHA-256 хеш на RP ID (32 байта), флагове (1 байт — кодиращи дали потребителят е присъствал, верифициран и т.н.) и брояч (4 байта — защита срещу клониране).",
        data: {
          "Credential ID": attResp.id,
          "Credential ID (hex)": base64urlToHex(attResp.id),
          "Client Data JSON": clientData,
          "Authenticator Data": authData
            ? {
                "RP ID Hash": authData.rpIdHash,
                "Flags byte": authData.flags.byte,
                "Flags binary": authData.flags.binary,
                "UP (User Present)": authData.flags.UP ? "Да" : "Не",
                "UV (User Verified)": authData.flags.UV ? "Да" : "Не",
                "AT (Attestation Data)": authData.flags.AT ? "Да" : "Не",
                "BE (Backup Eligible)": authData.flags.BE ? "Да" : "Не",
                "BS (Backed Up)": authData.flags.BS ? "Да" : "Не",
                "Брояч": authData.counter,
              }
            : "Не може да се парсне",
          "Attestation Object": attResp.response.attestationObject
            ? "(CBOR кодиран обект)"
            : "Няма",
          "Transports": attResp.response.transports || "Не са посочени",
        },
      });

      updateStep(setRegSteps, "reg-3", {
        status: "done",
        data: { credentialId: attResp.id },
      });

      // Step 4: Verify on server
      updateStep(setRegSteps, "reg-4", { status: "active" });
      addCryptoLog({
        step: "Изпращане за верификация към сървъра",
        icon: "arrow_right",
        description:
          "Целият attestation отговор се изпраща обратно към сървъра. Сървърът ще: 1) Провери дали challenge-ът съвпада с изпратения. 2) Провери дали origin-ът е очакваният. 3) Декодира CBOR attestation обекта. 4) Извлече и запази публичния ключ за бъдеща автентикация.",
        data: {
          "Credential ID": attResp.id,
          "Response тип": attResp.type,
        },
      });

      const verifyRes = await fetch("/api/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, response: attResp }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.verified) {
        addCryptoLog({
          step: "Регистрацията е успешна!",
          icon: "check",
          description:
            "Сървърът успешно верифицира attestation-а и запази публичния ключ. AAGUID идентифицира модела на автентикатора (напр. YubiKey 5). Credential ID е уникален идентификатор, свързващ този ключ с потребителя. Отсега нататък сървърът може да верифицира подписи, направени с частния ключ, без да го знае.",
          data: {
            "Credential ID": verifyData.debug.credentialId,
            "Публичен ключ (hex)": verifyData.debug.publicKeyHex,
            "Публичен ключ (base64url)": verifyData.debug.publicKeyBase64url,
            "Брояч": verifyData.debug.counter,
            "Credential тип": verifyData.debug.credentialType,
            "AAGUID": verifyData.debug.aaguid,
          },
        });
        updateStep(setRegSteps, "reg-4", {
          status: "done",
          data: verifyData.debug,
        });
        setStatusMessage("Регистрацията е успешна!");
        setStatusType("success");
      } else {
        throw new Error(verifyData.error || "Верификацията е неуспешна");
      }
    } catch (err: any) {
      addCryptoLog({
        step: "Грешка",
        icon: "error",
        data: { грешка: err.message },
      });
      setStatusMessage(`Грешка: ${err.message}`);
      setStatusType("error");
      // Mark current active step as error
      setRegSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
    }
  };

  const handleLogin = async () => {
    if (!username.trim() && mode === "hardware") {
      setStatusMessage("Моля, въведете потребителско име за режим хардуерен ключ");
      setStatusType("error");
      return;
    }

    setActiveFlow("login");
    setCryptoLog([]);
    resetSteps(setAuthSteps, initialAuthSteps);

    try {
      // Step 1
      updateStep(setAuthSteps, "auth-1", { status: "active" });
      addCryptoLog({
        step: "Заявка за автентикация",
        icon: "arrow_right",
        description:
          "Браузърът започва процеса по автентикация. При Passkey режим не е нужно потребителско име — автентикаторът сам открива съхранения credential (discoverable credential). При хардуерен ключ сървърът трябва да знае кой потребител се опитва да влезе, за да изпрати списък с неговите credential ID-та.",
        data: {
          username: mode === "passkey" ? "(не е необходимо при passkey)" : username,
          mode,
        },
      });
      await new Promise((r) => setTimeout(r, 500));
      updateStep(setAuthSteps, "auth-1", { status: "done" });

      // Step 2
      updateStep(setAuthSteps, "auth-2", { status: "active" });
      const optRes = await fetch("/api/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, mode }),
      });
      const { options, debug: serverDebug } = await optRes.json();

      addCryptoLog({
        step: "Challenge от сървъра (автентикация)",
        icon: "server",
        description:
          "Сървърът генерира нов challenge за тази сесия. allowCredentials е списък с Credential ID-та, които сървърът приема. При Passkey режим списъкът е празен — браузърът пита автентикатора за всички discoverable credentials за този RP ID. При хардуерен ключ — сървърът изпраща конкретните ID-та на регистрираните ключове.",
        data: {
          "Challenge (base64url)": serverDebug.challengeBase64url,
          "Challenge (hex)": serverDebug.challengeHex,
          "Allow Credentials": serverDebug.allowCredentials,
          "User Verification": serverDebug.userVerification,
        },
      });
      updateStep(setAuthSteps, "auth-2", { status: "done", data: serverDebug });

      // Step 3
      updateStep(setAuthSteps, "auth-3", { status: "active" });
      addCryptoLog({
        step: "Извикване на navigator.credentials.get()",
        icon: "key",
        description:
          "Браузърът извиква WebAuthn API-то за автентикация. Операционната система показва диалог за биометрия или PIN. Автентикаторът намира частния ключ, свързан с този RP ID, и подписва конкатенацията на authenticatorData и SHA-256 хеша на clientDataJSON. Подписът доказва притежание на частния ключ без да го разкрива.",
        data: {
          challenge: options.challenge,
          rpId: options.rpId,
          allowCredentials: options.allowCredentials || "[] (discoverable)",
        },
      });

      const authResp = await startAuthentication({ optionsJSON: options });

      const clientData = decodeClientDataJSON(authResp.response.clientDataJSON);
      const authData = parseAuthenticatorData(authResp.response.authenticatorData);

      addCryptoLog({
        step: "Assertion отговор от автентикатора",
        icon: "shield",
        description:
          "Автентикаторът връща assertion — цифров подпис, доказващ самоличността. Signature е DER-кодиран ECDSA/Ed25519 подпис върху (authenticatorData || SHA-256(clientDataJSON)). Сървърът ще го верифицира със запазения публичен ключ. Броячът се увеличава при всяко използване — ако сървърът види по-малка стойност от очакваната, може да подозира клониране на автентикатора.",
        data: {
          "Credential ID": authResp.id,
          "Credential ID (hex)": base64urlToHex(authResp.id),
          "Client Data JSON": clientData,
          "Authenticator Data": authData
            ? {
                "RP ID Hash": authData.rpIdHash,
                "Flags byte": authData.flags.byte,
                "Flags binary": authData.flags.binary,
                "UP (User Present)": authData.flags.UP ? "Да" : "Не",
                "UV (User Verified)": authData.flags.UV ? "Да" : "Не",
                "Брояч": authData.counter,
              }
            : "Не може да се парсне",
          "Signature (base64url)": authResp.response.signature,
          "Signature (hex)": base64urlToHex(authResp.response.signature),
          "User Handle": authResp.response.userHandle || "Няма",
        },
      });

      updateStep(setAuthSteps, "auth-3", { status: "done" });

      // Step 4
      updateStep(setAuthSteps, "auth-4", { status: "active" });
      addCryptoLog({
        step: "Верификация на подписа на сървъра",
        icon: "arrow_right",
        description:
          "Сървърът извършва следните проверки: 1) Challenge-ът съвпада с генерирания. 2) Origin-ът е очакваният (защита срещу фишинг). 3) RP ID хешът съвпада. 4) Флаговете UP/UV са зададени. 5) Броячът е по-голям от предишния. 6) Подписът е валиден спрямо запазения публичен ключ.",
        data: {},
      });

      const verifyRes = await fetch("/api/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, response: authResp, mode }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.verified) {
        addCryptoLog({
          step: "Автентикацията е успешна!",
          icon: "check",
          description:
            "Подписът е валиден — потребителят е доказал притежание на частния ключ, без да го разкрива. Броячът е обновен на сървъра. Целият процес не изисква пароли — сигурността се основава на асиметрична криптография и хардуерна защита на частния ключ.",
          data: {
            "Потребител": verifyData.username,
            "Credential ID": verifyData.debug.credentialId,
            "Публичен ключ (hex)": verifyData.debug.publicKeyHex,
            "Стар брояч": verifyData.debug.oldCounter,
            "Нов брояч": verifyData.debug.newCounter,
            "Backup": verifyData.debug.credentialBackedUp ? "Да" : "Не",
          },
        });
        updateStep(setAuthSteps, "auth-4", {
          status: "done",
          data: verifyData.debug,
        });
        setStatusMessage(
          `Добре дошли, ${verifyData.username}! Автентикацията е успешна.`
        );
        setStatusType("success");
      } else {
        throw new Error(verifyData.error || "Верификацията е неуспешна");
      }
    } catch (err: any) {
      addCryptoLog({
        step: "Грешка",
        icon: "error",
        data: { грешка: err.message },
      });
      setStatusMessage(`Грешка: ${err.message}`);
      setStatusType("error");
      setAuthSteps((prev) =>
        prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s))
      );
    }
  };

  const clearAll = () => {
    setCryptoLog([]);
    resetSteps(setRegSteps, initialRegSteps);
    resetSteps(setAuthSteps, initialAuthSteps);
    setActiveFlow("none");
    setStatusMessage("");
  };

  return (
    <div className="app">
      <header className="header">
        <h1>FIDO2 / WebAuthn Демо</h1>
        <p className="subtitle">
          Интерактивна демонстрация на регистрация и автентикация с WebAuthn
        </p>
      </header>

      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button
          className={`mode-btn ${mode === "passkey" ? "active" : ""}`}
          onClick={() => setMode("passkey")}
        >
          <span className="mode-icon">🔑</span>
          <span className="mode-label">
            <strong>Passkey режим</strong>
            <small>
              Discoverable credential, без attestation, вграден автентикатор
            </small>
          </span>
        </button>
        <button
          className={`mode-btn ${mode === "hardware" ? "active" : ""}`}
          onClick={() => setMode("hardware")}
        >
          <span className="mode-icon">🔐</span>
          <span className="mode-label">
            <strong>Хардуерен ключ</strong>
            <small>
              Cross-platform, direct attestation, server-side allowCredentials
            </small>
          </span>
        </button>
      </div>

      {/* Mode Details */}
      <div className="mode-details">
        {mode === "passkey" ? (
          <div className="mode-info">
            <h3>Passkey режим — Настройки</h3>
            <div className="settings-grid">
              <div className="setting">
                <span className="setting-key">residentKey</span>
                <span className="setting-value">"required"</span>
              </div>
              <div className="setting">
                <span className="setting-key">authenticatorAttachment</span>
                <span className="setting-value">няма (всички)</span>
              </div>
              <div className="setting">
                <span className="setting-key">userVerification</span>
                <span className="setting-value">"required"</span>
              </div>
              <div className="setting">
                <span className="setting-key">attestation</span>
                <span className="setting-value">"none"</span>
              </div>
              <div className="setting">
                <span className="setting-key">allowCredentials (login)</span>
                <span className="setting-value">[] (празен)</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mode-info">
            <h3>Хардуерен ключ — Настройки</h3>
            <div className="settings-grid">
              <div className="setting">
                <span className="setting-key">residentKey</span>
                <span className="setting-value">"discouraged"</span>
              </div>
              <div className="setting">
                <span className="setting-key">authenticatorAttachment</span>
                <span className="setting-value">"cross-platform"</span>
              </div>
              <div className="setting">
                <span className="setting-key">userVerification</span>
                <span className="setting-value">"preferred"</span>
              </div>
              <div className="setting">
                <span className="setting-key">attestation</span>
                <span className="setting-value">"direct"</span>
              </div>
              <div className="setting">
                <span className="setting-key">allowCredentials (login)</span>
                <span className="setting-value">
                  [списък от регистрирани credentials]
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Username + Actions */}
      <div className="controls">
        <div className="input-group">
          <label htmlFor="username">Потребителско име</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="напр. ivan"
          />
        </div>
        <div className="action-buttons">
          <button className="btn btn-register" onClick={handleRegister}>
            Регистрация
          </button>
          <button className="btn btn-login" onClick={handleLogin}>
            Вход
          </button>
          <button className="btn btn-clear" onClick={clearAll}>
            Изчисти
          </button>
        </div>
      </div>

      {/* Status */}
      {statusMessage && (
        <div className={`status-bar status-${statusType}`}>{statusMessage}</div>
      )}

      {/* Main Content: Flow + Crypto Details */}
      <div className="main-content">
        {/* Left: Flow Steps */}
        <div className="flow-section">
          {activeFlow === "register" && (
            <>
              <h2>Процес на регистрация</h2>
              <FlowDiagram
                steps={regSteps}
                participants={["Браузър", "Сървър", "Автентикатор"]}
              />
              <StepPanel steps={regSteps} />
            </>
          )}
          {activeFlow === "login" && (
            <>
              <h2>Процес на автентикация</h2>
              <FlowDiagram
                steps={authSteps}
                participants={["Браузър", "Сървър", "Автентикатор"]}
              />
              <StepPanel steps={authSteps} />
            </>
          )}
          {activeFlow === "none" && (
            <div className="empty-state">
              <div className="empty-icon">🛡️</div>
              <h2>Изберете действие</h2>
              <p>
                Въведете потребителско име и натиснете „Регистрация" или „Вход",
                за да видите процеса стъпка по стъпка.
              </p>
            </div>
          )}
        </div>

        {/* Right: Crypto Details */}
        <div className="crypto-section">
          <h2>Криптографски детайли</h2>
          <CryptoDetails log={cryptoLog} />
        </div>
      </div>
    </div>
  );
}
