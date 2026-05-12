'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadImage } from './upload-image';

/**
 * Tiptap-based Markdown editor.
 *
 * Storage format: Markdown. We use tiptap-markdown to serialize on every
 * change and emit through onChange. Roundtripping limitations to be aware
 * of (in order of likelihood we hit them):
 *
 *   - Embed nodes are not stored as custom Markdown syntax. The editor
 *     paste handler instead treats embeddable URLs as plain links; the
 *     <RichText> renderer detects URL-only paragraphs at render time and
 *     promotes them to iframes. Symmetry by convention, not by serializer.
 *   - Nested lists with mixed bullet styles can re-serialize with different
 *     markers (- vs *). Acceptable; couples won't care.
 *   - tiptap-markdown drops `<u>` (underline) — not part of CommonMark.
 *     We don't enable Underline in StarterKit; couples use italic instead.
 *
 * Image drops/pastes upload via uploadImage() and insert an <img> node
 * pointing at the returned URL. Failed uploads surface inline beneath the
 * editor; the editor itself doesn't get blocked.
 */

interface Props {
  /** Markdown string. */
  value: string;
  onChange: (markdown: string) => void;
  /** Wedding scope for the image upload endpoint. Required when allowImages. */
  weddingId: string;
  placeholder?: string;
  allowImages?: boolean;
  /** Disable Tiptap's interactive editing — read-only preview mode. */
  disabled?: boolean;
  /** Sets the min visible height of the editor body. */
  minHeight?: number;
  /** Soft character cap, surfaced as a counter; doesn't block typing. */
  maxLength?: number;
  /** Optional autofocus on mount. */
  autoFocus?: boolean;
}

export default function RichTextEditor({
  value,
  onChange,
  weddingId,
  placeholder = 'Write something…',
  allowImages = true,
  disabled = false,
  minHeight = 120,
  maxLength,
  autoFocus = false,
}: Props) {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  // Tiptap fires its first onUpdate during initialization with the parsed
  // content. We want to skip that initial pass so we don't echo
  // value→onChange→value and stomp on the cursor position.
  const initializedRef = useRef(false);

  const handleImageUpload = useCallback(
    async (files: FileList | File[], editor: Editor) => {
      if (!allowImages) return;
      setUploadError(null);
      const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (list.length === 0) return;
      for (const file of list) {
        setUploading((n) => n + 1);
        try {
          const { url, width, height } = await uploadImage(file, weddingId);
          editor
            .chain()
            .focus()
            .setImage({ src: url, alt: file.name.replace(/\.[a-z0-9]+$/i, ''), title: file.name })
            .run();
          void width;
          void height;
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
          setUploading((n) => Math.max(0, n - 1));
        }
      }
    },
    [allowImages, weddingId]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We render h2/h3 only — h1 is reserved for page titles.
        heading: { levels: [2, 3] },
        // Disable codeBlock to keep the rendered surface simple and to
        // avoid sanitizer surprises; inline code is still on.
        codeBlock: false,
        // Disable horizontal rule and blockquote markdown syntax for now —
        // can re-enable once couples ask for them.
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        // Match the sanitizer's protocol allowlist so the editor's preview
        // matches the rendered output.
        protocols: ['http', 'https', 'mailto', 'tel'],
        HTMLAttributes: {
          rel: 'noopener noreferrer',
          target: '_blank',
        },
      }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          loading: 'lazy',
          style: 'max-width: 100%; height: auto; border-radius: 8px;',
        },
      }),
      Placeholder.configure({ placeholder }),
      Markdown.configure({
        html: false, // never emit raw HTML in serialized markdown
        tightLists: true,
        breaks: true, // single newline → <br> on parse, matching <RichText> plain-mode parity
        transformPastedText: false, // we handle paste ourselves for embeds; let plain-text paste through
        transformCopiedText: false,
      }),
    ],
    content: value || '',
    editable: !disabled,
    autofocus: autoFocus ? 'end' : false,
    // Avoid Tiptap's SSR warning on Next: skip until client mount.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'rich-text-editor',
        style: `min-height: ${minHeight}px; outline: none;`,
      },
      handleDrop(view, event) {
        const files = event.dataTransfer?.files;
        if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith('image/'))) {
          event.preventDefault();
          if (editor) handleImageUpload(files, editor);
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        const files = event.clipboardData?.files;
        if (files && files.length > 0 && Array.from(files).some((f) => f.type.startsWith('image/'))) {
          event.preventDefault();
          if (editor) handleImageUpload(files, editor);
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor }) {
      if (!initializedRef.current) {
        initializedRef.current = true;
        return;
      }
      const md = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown?.getMarkdown?.() ?? '';
      onChange(md);
    },
  });

  // External value changes (e.g. parent resets the field on save) should
  // sync into the editor without re-creating it.
  useEffect(() => {
    if (!editor) return;
    const current = (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown?.getMarkdown?.() ?? '';
    if (current !== value) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const charCount = editor?.storage.characterCount?.characters?.() ?? value.length;

  return (
    <div
      style={{
        borderRadius: 10,
        border: '1px solid var(--border-light)',
        background: 'var(--bg-pure-white)',
        overflow: 'hidden',
      }}
    >
      {editor && <Toolbar editor={editor} allowImages={allowImages} onPickImage={(files) => handleImageUpload(files, editor)} />}
      <div style={{ padding: '12px 14px' }}>
        <EditorContent editor={editor} />
      </div>
      <div
        style={{
          padding: '6px 12px',
          borderTop: '1px solid var(--border-light)',
          background: 'var(--bg-soft-cream)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          fontSize: 11,
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-body)',
        }}
      >
        <span>
          {uploading > 0
            ? `Uploading ${uploading} image${uploading === 1 ? '' : 's'}…`
            : uploadError
            ? <span style={{ color: 'var(--color-terracotta)' }}>{uploadError}</span>
            : 'Markdown supported. Drag or paste images to embed.'}
        </span>
        {maxLength != null && (
          <span style={{ opacity: charCount > maxLength ? 1 : 0.7, color: charCount > maxLength ? 'var(--color-terracotta)' : undefined }}>
            {charCount} / {maxLength}
          </span>
        )}
      </div>
    </div>
  );
}

function Toolbar({
  editor,
  allowImages,
  onPickImage,
}: {
  editor: Editor;
  allowImages: boolean;
  onPickImage: (files: FileList) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      style={{
        display: 'flex',
        gap: 2,
        flexWrap: 'wrap',
        padding: '6px 8px',
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-soft-cream)',
      }}
    >
      <ToolButton
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="B"
        title="Bold (Ctrl+B)"
        style={{ fontWeight: 700 }}
      />
      <ToolButton
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="I"
        title="Italic (Ctrl+I)"
        style={{ fontStyle: 'italic' }}
      />
      <ToolDivider />
      <ToolButton
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="H2"
        title="Heading 2"
      />
      <ToolButton
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="H3"
        title="Heading 3"
      />
      <ToolDivider />
      <ToolButton
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="•"
        title="Bullet list"
      />
      <ToolButton
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="1."
        title="Numbered list"
      />
      <ToolDivider />
      <ToolButton
        active={editor.isActive('link')}
        onClick={() => {
          const prev = (editor.getAttributes('link') as { href?: string }).href ?? '';
          const url = window.prompt('Link URL (https://…)', prev);
          if (url === null) return;
          if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
          }
          editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
        }}
        label="🔗"
        title="Add link"
      />
      {allowImages && (
        <>
          <ToolButton
            onClick={() => fileInputRef.current?.click()}
            label="🖼"
            title="Upload image"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) onPickImage(e.target.files);
              e.currentTarget.value = '';
            }}
          />
        </>
      )}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  title,
  style,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  title: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      style={{
        padding: '5px 9px',
        borderRadius: 6,
        border: 'none',
        background: active ? 'var(--color-gold-dark)' : 'transparent',
        color: active ? '#FDFBF7' : 'var(--text-primary)',
        fontSize: 13,
        fontFamily: 'var(--font-body)',
        cursor: 'pointer',
        minWidth: 30,
        ...style,
      }}
    >
      {label}
    </button>
  );
}

function ToolDivider() {
  return <span style={{ width: 1, background: 'var(--border-light)', margin: '4px 4px' }} />;
}
