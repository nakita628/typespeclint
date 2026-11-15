import "@typespec/http";

using Http;

@service(#{ title: "Banking API" })
namespace Banking;

// The design proposed in section 13.3.2: POST /send-email with an optional
// string `email` and an optional number `msg`.
model SendEmailDTO {
  email?: string;
  msg?: float64;
}

model Unused {
  // An error-level finding can still be suppressed where it is deliberate.
  #suppress "typespeclint/property-naming" "name fixed by the legacy ledger"
  created_at: string;
}

@route("/send_email")
@post
op sendEmail(@body body: SendEmailDTO): void;
