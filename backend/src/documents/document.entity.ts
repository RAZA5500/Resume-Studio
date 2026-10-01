import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';

/**
 * pdf / image → opened in the canvas editor on top of the original file
 * rich        → opened in the rich-text editor (Word, text, HTML, blank docs)
 * canvas      → blank design canvas
 */
export type DocumentKind = 'pdf' | 'image' | 'rich' | 'canvas';

@Entity('documents')
export class DocumentFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User>;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  kind: DocumentKind;

  /** Extension of the uploaded original (pdf, png, docx…) or null for blank documents. */
  @Column({ type: 'varchar', length: 12, nullable: true })
  sourceFormat: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  originalName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', default: 0 })
  size: number;

  /** File name inside UPLOAD_DIR. */
  @Column({ type: 'varchar', length: 120, nullable: true, select: false })
  storageKey: string | null;

  /** Canvas pages (Fabric JSON) or rich-text HTML, saved by the editor. */
  @Column({ type: 'jsonb', nullable: true, select: false })
  editorState: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;

  @Column({ type: 'int', nullable: true })
  pageCount: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
