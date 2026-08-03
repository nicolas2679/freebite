# Microsoft interest form setup

The custom FreeBite form sends submissions to `/api/interest`. That Cloudflare
Pages Function writes each response to a private Microsoft List through
Microsoft Graph.

## 1. Create the Microsoft List

In Microsoft Lists, create a blank list named `FreeBite Interest`. Keep the
built-in `Title` column and add these columns using the exact names shown:

| Column | Type | Required |
| --- | --- | --- |
| Email | Single line of text | Yes |
| Usefulness | Multiple lines of text, plain text | No |
| Consented | Choice with `Yes` and `No` options | Yes |
| SubmittedAt | Date and time | Yes |
| ConsentVersion | Single line of text | Yes |
| Source | Single line of text | Yes |

The function also writes the email address into the built-in `Title` column.

## 2. Register the backend with Microsoft

1. Open the Microsoft Entra admin center.
2. Go to **Identity > Applications > App registrations > New registration**.
3. Name it `FreeBite website interest form` and use accounts from this
   organization only. No redirect URI is needed.
4. Record the **Application (client) ID** and **Directory (tenant) ID**.
5. Under **Certificates & secrets**, create a client secret and record its
   value immediately.
6. Under **API permissions**, add the Microsoft Graph **Application** permission
   `Sites.Selected`, then grant admin consent.
7. A Microsoft 365 administrator must grant this app `write` access to only the
   SharePoint site containing the list. `Sites.Selected` alone grants no site
   access. The administrator can make this Microsoft Graph request, replacing
   the placeholders with the site ID and application client ID:

```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "{client-id}",
        "displayName": "FreeBite website interest form"
      }
    }
  ]
}
```

Do not add `Sites.ReadWrite.All`; it would let this credential write to every
SharePoint site in the tenant.

## 3. Find the site and list IDs

The function needs the Microsoft Graph site ID and list ID. They can be found
with Graph Explorer after signing in as an administrator:

```text
GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{site-name}
GET https://graph.microsoft.com/v1.0/sites/{site-id}/lists?$filter=displayName eq 'FreeBite Interest'
```

Copy the `id` from each response.

## 4. Add Cloudflare secrets

In **Workers & Pages > freebite-site > Settings > Variables and Secrets**, add:

| Name | Value | Storage |
| --- | --- | --- |
| MICROSOFT_TENANT_ID | Directory (tenant) ID | Plain text |
| MICROSOFT_CLIENT_ID | Application (client) ID | Plain text |
| MICROSOFT_CLIENT_SECRET | Client secret value | Encrypt |
| MICROSOFT_SITE_ID | Microsoft Graph site ID | Plain text |
| MICROSOFT_LIST_ID | Microsoft Graph list ID | Plain text |

Add them to both Production and Preview if preview deployments should submit.
Redeploy after adding them.

## 5. Test

Submit the form on the deployed site, then open the `FreeBite Interest` list.
The response should appear as a new row. If it fails, inspect the Pages Function
logs in Cloudflare; Microsoft errors are logged without exposing them publicly.

## Official references

- Microsoft Graph app-only authentication:
  https://learn.microsoft.com/en-us/graph/auth-v2-service
- Create a SharePoint list item with Microsoft Graph:
  https://learn.microsoft.com/en-us/graph/api/listitem-create
- Microsoft Resource Specific Consent and `Sites.Selected`:
  https://learn.microsoft.com/en-au/sharepoint/dev/sp-add-ins-modernize/understanding-rsc-for-msgraph-and-sharepoint-online
- Cloudflare Pages Functions secrets:
  https://developers.cloudflare.com/pages/functions/bindings/
