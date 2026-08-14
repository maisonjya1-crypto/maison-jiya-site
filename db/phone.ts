export function normalizeMoroccanPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00212")) digits = digits.slice(5);
  else if (digits.startsWith("212")) digits = digits.slice(3);
  if (/^[5-7]\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^0[5-7]\d{8}$/.test(digits) ? digits : null;
}

export const moroccanPhoneHelp = "Entrez un numéro marocain valide sur 10 chiffres, par exemple 0612345678.";
