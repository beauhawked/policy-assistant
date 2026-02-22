import { BillDetailPageContent } from "@/components/bill-detail-page";

export const dynamic = "force-dynamic";

export default async function BillPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const params = await searchParams;
  const billName = params.name ?? "";

  return <BillDetailPageContent billName={billName} />;
}
