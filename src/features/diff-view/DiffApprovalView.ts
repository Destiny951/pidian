import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { Decoration, EditorView, lineNumbers } from '@codemirror/view';
import type { WorkspaceLeaf } from 'obsidian';
import { ItemView, MarkdownView, setIcon, TFile } from 'obsidian';

import { VIEW_TYPE_DIFF_APPROVAL } from '../../core/types';
import type { DiffLine } from '../../core/types/diff';
import type PidianPlugin from '../../main';
import { buildLineDiffLines, countLineChanges, reconstructFromDiff } from '../../utils/diff';

export interface DiffApprovalParams {
  filePath: string;
  operation: 'edit' | 'write' | 'create';
  diffLines: DiffLine[];
  originalContent?: string;
  proposedContent?: string;
}

export type DiffApprovalDecision = 'approve' | 'reject' | 'cancel';
type DiffApprovalResult = { decision: DiffApprovalDecision; editedContent?: string };

interface LineDecoration {
  lineIndex: number;
  type: 'delete' | 'insert';
}

let pendingRequest: { params: DiffApprovalParams; resolve: (result: DiffApprovalResult) => void } | null = null;

export class DiffApprovalView extends ItemView {
  private plugin: PidianPlugin;
  private params: DiffApprovalParams | null = null;
  private leftEditor: EditorView | null = null;
  private rightEditor: EditorView | null = null;
  private originalContent: string = '';
  private proposedContent: string = '';
  private leftDecoField: StateField<DecorationSet> | null = null;
  private rightDecoField: StateField<DecorationSet> | null = null;
  private readonly leftDecoEffect = StateEffect.define<LineDecoration[]>();
  private readonly rightDecoEffect = StateEffect.define<LineDecoration[]>();

  constructor(leaf: WorkspaceLeaf, plugin: PidianPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_DIFF_APPROVAL;
  }

  getDisplayText(): string {
    const params = this.params ?? pendingRequest?.params;
    return params ? `Diff: ${params.filePath}` : 'Diff Review';
  }

  getIcon(): string {
    return 'file-edit';
  }

  async onOpen(): Promise<void> {
    const params = pendingRequest?.params ?? null;
    if (!params) {
      this.containerEl.children[1].createDiv({ text: 'No diff to display' });
      return;
    }
    this.params = params;

    const { original, proposed } = params.originalContent !== undefined && params.proposedContent !== undefined
      ? { original: params.originalContent, proposed: params.proposedContent }
      : reconstructFromDiff(params.diffLines);

    this.originalContent = original;
    this.proposedContent = proposed;

    this.renderView();
  }

  async onClose(): Promise<void> {
    this.leftEditor?.destroy();
    this.rightEditor?.destroy();
    this.leftEditor = null;
    this.rightEditor = null;
    this.resolveDecision({ decision: 'cancel' });
  }

  private renderView(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('pidian-diff-view');

    const params = this.params!;

    const header = container.createDiv({ cls: 'pidian-diff-header' });

    const infoEl = header.createDiv({ cls: 'pidian-diff-header-info' });
    const iconEl = infoEl.createSpan({ cls: 'pidian-diff-header-icon' });
    setIcon(iconEl, params.operation === 'create' ? 'file-plus' : 'file-edit');

    const titleEl = infoEl.createDiv({ cls: 'pidian-diff-header-title' });
    titleEl.createSpan({ text: params.operation === 'create' ? 'Create File' : 'Edit File', cls: 'pidian-diff-header-op' });
    titleEl.createSpan({ text: params.filePath, cls: 'pidian-diff-header-path' });

    const stats = countLineChanges(params.diffLines);
    const statsEl = infoEl.createDiv({ cls: 'pidian-diff-header-stats' });
    statsEl.createSpan({ text: `+${stats.added}`, cls: 'pidian-diff-stat-added' });
    statsEl.createSpan({ text: `-${stats.removed}`, cls: 'pidian-diff-stat-removed' });

    const actionsEl = header.createDiv({ cls: 'pidian-diff-header-actions' });
    const rejectBtn = actionsEl.createSpan({ cls: 'pidian-diff-action-btn reject' });
    setIcon(rejectBtn, 'x');
    rejectBtn.title = 'Reject (Esc)';
    rejectBtn.addEventListener('click', () => this.handleReject());

    const approveBtn = actionsEl.createSpan({ cls: 'pidian-diff-action-btn approve' });
    setIcon(approveBtn, 'check');
    approveBtn.title = 'Approve (Cmd/Ctrl+Enter)';
    approveBtn.addEventListener('click', () => this.handleApprove());

    const panes = container.createDiv({ cls: 'pidian-diff-panes' });

    const leftPane = panes.createDiv({ cls: 'pidian-diff-pane' });
    leftPane.createDiv({ text: 'Original', cls: 'pidian-diff-pane-header' });
    const leftContent = leftPane.createDiv({ cls: 'pidian-diff-pane-content' });

    const rightPane = panes.createDiv({ cls: 'pidian-diff-pane' });
    const rightHeader = rightPane.createDiv({ cls: 'pidian-diff-pane-header' });
    rightHeader.createSpan({ text: 'Proposed' });
    rightHeader.createSpan({ text: '(editable)', cls: 'pidian-diff-pane-hint' });
    const rightContent = rightPane.createDiv({ cls: 'pidian-diff-pane-content' });

    this.leftDecoField = this.createDecoField('left');
    this.rightDecoField = this.createDecoField('right');

    this.leftEditor = this.createEditor(leftContent, this.originalContent, true, this.leftDecoField);
    this.rightEditor = this.createEditor(rightContent, this.proposedContent, false, this.rightDecoField);

    this.updateDiffDecorations();

    this.registerDomEvent(container, 'keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.handleReject();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.handleApprove();
      }
    });
  }

  private createDecoField(side: 'left' | 'right'): StateField<DecorationSet> {
    const effect = side === 'left' ? this.leftDecoEffect : this.rightDecoEffect;
    return StateField.define<DecorationSet>({
      create: () => Decoration.none,
      update: (deco, transaction) => {
        for (const transactionEffect of transaction.effects) {
          if (transactionEffect.is(effect)) {
            return this.buildDecorations(transactionEffect.value, side);
          }
        }
        return deco.map(transaction.changes);
      },
      provide: (f) => EditorView.decorations.from(f),
    });
  }

  private createEditor(container: HTMLElement, content: string, readOnly: boolean, decoField: StateField<DecorationSet>): EditorView {
    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        EditorState.readOnly.of(readOnly),
        decoField,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
          '.cm-content': { padding: '4px 0' },
          '.cm-line': { padding: '0 12px' },
        }),
        !readOnly ? EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.updateDiffDecorations();
          }
        }) : [],
      ],
    });

    const view = new EditorView({ state, parent: container });
    
    view.scrollDOM.addEventListener('scroll', () => {
      this.handleScroll(view);
    });

    return view;
  }

  private isScrollSyncing: boolean = false;

  private handleScroll(sourceEditor: EditorView): void {
    if (this.isScrollSyncing) return;
    if (!this.leftEditor || !this.rightEditor) return;

    const targetEditor = sourceEditor === this.leftEditor ? this.rightEditor : this.leftEditor;
    if (!targetEditor) return;

    const sourceScroller = sourceEditor.scrollDOM;
    const targetScroller = targetEditor.scrollDOM;

    const scrollRatio = sourceScroller.scrollTop / (sourceScroller.scrollHeight - sourceScroller.clientHeight || 1);
    const targetScrollTop = scrollRatio * (targetScroller.scrollHeight - targetScroller.clientHeight);

    this.isScrollSyncing = true;
    targetScroller.scrollTop = targetScrollTop;
    
    requestAnimationFrame(() => {
      this.isScrollSyncing = false;
    });
  }

  private updateDiffDecorations(): void {
    if (!this.leftEditor || !this.rightEditor || !this.leftDecoField || !this.rightDecoField) return;

    const currentProposed = this.rightEditor.state.doc.toString();
    const { leftDecos, rightDecos } = getLineDecorations(buildLineDiffLines(this.originalContent, currentProposed));

    this.leftEditor.dispatch({
      effects: this.leftDecoEffect.of(leftDecos),
    });

    this.rightEditor.dispatch({
      effects: this.rightDecoEffect.of(rightDecos),
    });
  }

  private buildDecorations(decorations: LineDecoration[], side: 'left' | 'right'): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const decoByLine = new Map(decorations.map((deco) => [deco.lineIndex, deco]));
    const doc = side === 'left' ? this.leftEditor?.state.doc : this.rightEditor?.state.doc;
    if (!doc) return Decoration.none;

    for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
      const deco = decoByLine.get(lineNumber - 1);
      if (!deco) continue;
      const line = doc.line(lineNumber);
      const className = deco.type === 'delete' ? 'pidian-diff-line-delete' : 'pidian-diff-line-insert';
      builder.add(line.from, line.from, Decoration.line({ class: className }));
    }
    return builder.finish();
  }

  private async handleApprove(): Promise<void> {
    const editedContent = this.rightEditor?.state.doc.toString() ?? this.proposedContent;
    this.resolveDecision({ decision: 'approve', editedContent });

    await this.reopenOriginalFile();
    this.leaf.detach();
  }

  private async handleReject(): Promise<void> {
    this.resolveDecision({ decision: 'reject' });

    await this.reopenOriginalFile();
    this.leaf.detach();
  }

  private resolveDecision(result: DiffApprovalResult): void {
    const request = pendingRequest;
    if (!request || request.params !== this.params) return;
    pendingRequest = null;
    request.resolve(result);
  }

  private async reopenOriginalFile(): Promise<void> {
    const filePath = this.params?.filePath;
    if (!filePath) return;

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      const leaf = this.plugin.app.workspace.getLeaf('tab');
      await leaf.openFile(file);
    }
  }

  static async showDiff(plugin: PidianPlugin, params: DiffApprovalParams): Promise<DiffApprovalResult> {
    const filePath = params.filePath;

    pendingRequest?.resolve({ decision: 'cancel' });
    pendingRequest = null;

    for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === filePath) {
        leaf.detach();
        break;
      }
    }

    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE_DIFF_APPROVAL)) {
      leaf.detach();
    }

    const leaf = plugin.app.workspace.getLeaf('split', 'vertical');
    return new Promise((resolve) => {
      pendingRequest = { params, resolve };
      void leaf.setViewState({ type: VIEW_TYPE_DIFF_APPROVAL, active: true }).then(() => {
        plugin.app.workspace.revealLeaf(leaf);
      }).catch((error) => {
        if (pendingRequest?.params === params) {
          pendingRequest = null;
          resolve({ decision: 'cancel' });
        }
        console.error('[DiffApprovalView] Failed to open diff view:', error);
      });
    });
  }
}

function getLineDecorations(diffLines: DiffLine[]): { leftDecos: LineDecoration[]; rightDecos: LineDecoration[] } {
  const leftDecos: LineDecoration[] = [];
  const rightDecos: LineDecoration[] = [];

  for (const line of diffLines) {
    if (line.type === 'delete' && line.oldLineNum !== undefined) {
      leftDecos.push({ lineIndex: line.oldLineNum - 1, type: 'delete' });
    } else if (line.type === 'insert' && line.newLineNum !== undefined) {
      rightDecos.push({ lineIndex: line.newLineNum - 1, type: 'insert' });
    }
  }

  return { leftDecos, rightDecos };
}
