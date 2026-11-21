type Row = { id: string; [key: string]: any };

const day = 86_400_000;
const dateOnly = (value: number) => new Date(value).toISOString().slice(0, 10);
const dubaiDate = (now: number) => dateOnly(now + 4 * 3_600_000);
const midnight = (date: string) => Date.parse(date + 'T00:00:00+04:00');

export function previewLateOptions(contract: Row, requests: Row[]) {
  const now = Date.now();
  const payments: Row[] = (contract.payments ??= []);
  const generated = payments.find(({ id }) => id === 'preview-late-rent');
  if (
    !generated ||
    (!requests.some((row) => row.metadata?.latePayment?.paymentId === generated.id) &&
      Date.parse(generated.dueDate) <= now)
  ) {
    const current = {
      id: 'preview-late-rent',
      dueDate: new Date(midnight(dubaiDate(now + 2 * day))).toISOString(),
      expectedDate: null,
      amountDue: contract.monthlyRent,
      amountPaid: '0',
      currency: contract.currency,
      status: 'UPCOMING',
    };
    if (generated) Object.assign(generated, current);
    else payments.unshift(current);
  }
  const obligations = payments.flatMap((payment) => {
    const due = midnight(dubaiDate(Date.parse(payment.dueDate)));
    if (
      payment.expectedDate ||
      Number(payment.amountPaid) >= Number(payment.amountDue) ||
      now < due - 10 * day ||
      now >= due
    )
      return [];
    return [
      {
        id: payment.id,
        originalDate: dubaiDate(due),
        earliestDate: dubaiDate(due + day),
        latestDate: dubaiDate(due + 5 * day),
      },
    ];
  });
  return { windowDays: 10, extensionDays: 5, nextApprovalAt: nextApproval(requests), obligations };
}

function nextApproval(requests: Row[]) {
  const prior = requests
    .filter((row) => row.type === 'LATE_PAYMENT')
    .flatMap((row) => row.events ?? [])
    .filter((event) => event.kind === 'APPROVED')
    .map((event) => String(event.createdAt))
    .sort()
    .at(-1);
  if (!prior) return null;
  const current = new Date(dubaiDate(Date.parse(prior)) + 'T00:00:00Z');
  const target = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 6, 1));
  const limit = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0));
  target.setUTCDate(Math.min(current.getUTCDate(), limit.getUTCDate()));
  const start = midnight(dateOnly(target.getTime()));
  return start > Date.now() ? new Date(start).toISOString() : null;
}

export function previewLateDecision(
  record: Row,
  status: string,
  contracts: Row[],
  requests: Row[],
  fail: (message: string, status: number) => never,
) {
  if (!(status === 'APPROVED' || (status === 'CLOSED' && record.status === 'APPROVED')))
    return undefined;
  const details = record.metadata?.latePayment;
  const payment = contracts
    .find((row) => row.id === record.contractId)
    ?.payments?.find((row: Row) => row.id === details?.paymentId);
  if (!payment || !details) return fail('Rent obligation unavailable', 409);
  if (
    status === 'APPROVED' &&
    (nextApproval(requests) ||
      payment.expectedDate ||
      midnight(details.requestedDate) <= Date.now())
  )
    return fail('The requested extension is unavailable', 409);
  payment.expectedDate =
    status === 'APPROVED' ? new Date(midnight(details.requestedDate)).toISOString() : null;
  return {
    originalDate: details.originalDate,
    expectedDate: status === 'APPROVED' ? details.requestedDate : null,
  };
}
