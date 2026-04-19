import { NextRequest } from 'next/server';
import { handleApiError, AppError } from '@/lib/errors';
import { getPool } from '@/lib/db/client';
import { requireWeddingAccess } from '@/lib/dashboard-auth';
import { sendEmail, isResendConfigured } from '@/lib/email/resend-client';
import { buildGuestEmail } from '@/lib/email/templates';

const DEFAULT_NOTIFICATION_EMAIL = 'shriyaneilwedding@gmail.com';

/**
 * POST /api/v1/dashboard/weddings/[weddingId]/todos/[todoId]/nudge
 * Sends a reminder email about a single to-do. Vendor-assigned to-dos email
 * the vendor; couple to-dos email the configured notification address.
 * Logged in vendor_email_log either way.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ weddingId: string; todoId: string }> }
) {
  try {
    const { weddingId, todoId } = await params;
    await requireWeddingAccess(request, weddingId);

    const pool = getPool();
    const result = await pool.query(
      `SELECT t.id, t.title, t.description, t.due_date, t.priority, t.status,
              t.assigned_to_vendor_id, t.created_at,
              v.name AS vendor_name, v.email AS vendor_email, v.access_token,
              w.display_name AS wedding_name, w.slug AS wedding_slug, w.config AS wedding_config
       FROM todos t
       LEFT JOIN vendors v ON v.id = t.assigned_to_vendor_id
       JOIN weddings w ON w.id = t.wedding_id
       WHERE t.id = $1 AND t.wedding_id = $2`,
      [todoId, weddingId]
    );
    if (result.rows.length === 0) throw new AppError('WEDDING_NOT_FOUND');

    const row = result.rows[0];

    if (row.status === 'completed') {
      throw new AppError('VALIDATION_ERROR', 'This to-do is already completed');
    }

    if (!isResendConfigured()) {
      throw new AppError('VALIDATION_ERROR', 'Email is not configured on this wedding');
    }

    const ageDays = Math.floor(
      (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    const dueLine = row.due_date ? `Due: ${row.due_date}` : 'No due date set';
    const priorityLine =
      row.priority === 'high' ? 'Priority: HIGH' : row.priority === 'low' ? 'Priority: low' : '';
    const ageLine = ageDays > 0 ? `Open for ${ageDays} day${ageDays === 1 ? '' : 's'}` : '';

    const bodyParts = [
      'Quick reminder about this to-do:',
      `${row.title}${row.description ? `\n\n${row.description}` : ''}`,
      [dueLine, priorityLine, ageLine].filter(Boolean).join('\n'),
    ];

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
    const isVendor = !!row.assigned_to_vendor_id;
    const vendorEmail: string | null = row.vendor_email;

    let recipient: string;
    let subject: string;
    let ctaUrl: string | undefined;
    let logVendorId: string | null = null;

    if (isVendor) {
      if (!vendorEmail) {
        throw new AppError('VALIDATION_ERROR', 'This vendor has no email on file');
      }
      recipient = vendorEmail;
      subject = `Reminder: ${row.title.slice(0, 80)}`;
      ctaUrl = appUrl ? `${appUrl}/v/${row.wedding_slug}/${row.access_token}` : undefined;
      logVendorId = row.assigned_to_vendor_id;
    } else {
      const config = row.wedding_config || {};
      recipient =
        (typeof config.vendor_notification_email === 'string' && config.vendor_notification_email) ||
        DEFAULT_NOTIFICATION_EMAIL;
      subject = `Reminder: ${row.title.slice(0, 80)}`;
      ctaUrl = appUrl ? `${appUrl}/dashboard/${weddingId}/todos` : undefined;
    }

    const { html, text } = buildGuestEmail({
      weddingName: row.wedding_name,
      heading: 'Reminder',
      body: bodyParts.join('\n\n'),
      ctaLabel: ctaUrl ? (isVendor ? 'Open your vendor page' : 'Open the to-do list') : undefined,
      ctaUrl,
    });

    const sendResult = await sendEmail({
      to: recipient,
      subject,
      html,
      text,
    });

    await pool.query(
      `INSERT INTO vendor_email_log
         (wedding_id, vendor_id, recipient_email, subject, email_type, resend_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [weddingId, logVendorId, recipient, subject, 'todo_nudge', sendResult.id]
    );

    return Response.json({
      data: {
        sent: !sendResult.error,
        recipient,
        error: sendResult.error,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
