import { BillDetailPageContent } from "@/components/bill-detail-page";

export const dynamic = "force-dynamic";

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ billName: string }>;
}) {
  const { billName } = await params;
  return <BillDetailPageContent billName={billName} />;
}
