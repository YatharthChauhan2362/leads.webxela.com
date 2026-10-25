import { addManual } from "../actions";
import { Flash } from "@/components/ui/flash";
import { Field, FormGrid, Input, Textarea } from "@/components/ui/form";
import { Card, PageHeader } from "@/components/ui/layout";
import { SubmitButton } from "@/components/ui/submit-button";

export default function AddPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <>
      <PageHeader title="Add a post" description="Paste a post from anywhere. It is scored and any email or phone in it is pulled out." />
      <Flash searchParams={searchParams} />
      <Card>
        <form action={addManual} className="space-y-5">
          <input type="hidden" name="back" value="/add" />
          <Field label="Post text" htmlFor="text">
            <Textarea id="text" name="text" required minLength={20} className="min-h-48" />
          </Field>
          <FormGrid>
            <Field label="Name" htmlFor="author" optional>
              <Input id="author" name="author" />
            </Field>
            <Field label="Profile link" htmlFor="author_url" optional>
              <Input id="author_url" name="author_url" type="url" />
            </Field>
            <Field label="Post link" htmlFor="post_url" optional>
              <Input id="post_url" name="post_url" type="url" />
            </Field>
          </FormGrid>
          <SubmitButton pendingText="Scoring...">Score and add</SubmitButton>
        </form>
      </Card>
    </>
  );
}
