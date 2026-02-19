<script lang="ts">
	interface Props {
		title: string;
		collapsed: boolean;
		onToggle: () => void;
		vertical?: boolean;
	}

	let { title, collapsed, onToggle, vertical = false }: Props = $props();
</script>

{#if vertical}
	<button class="pane-header-vertical" onclick={onToggle}>
		<span class="chevron-v">▶</span>
		<span class="pane-title-v">{title}</span>
	</button>
{:else}
	<button class="pane-header" onclick={onToggle}>
		<span class="chevron">
			{collapsed ? '▶' : '▼'}
		</span>
		<span class="pane-title">{title}</span>
	</button>
{/if}

<style>
	.pane-header {
		height: 24px;
		width: 100%;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0 8px;
		background: rgba(255, 255, 255, 0.03);
		border: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
		user-select: none;
		cursor: pointer;
	}
	.pane-header:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.chevron {
		color: rgba(255, 255, 255, 0.4);
		font-size: 8px;
		line-height: 1;
	}
	.pane-title {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
	}

	/* Vertical collapsed header — rotated sidebar tab */
	.pane-header-vertical {
		width: 24px;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 8px 0;
		background: rgba(255, 255, 255, 0.03);
		border: none;
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		cursor: pointer;
		user-select: none;
	}
	.pane-header-vertical:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.chevron-v {
		color: rgba(255, 255, 255, 0.4);
		font-size: 8px;
		line-height: 1;
	}
	.pane-title-v {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.5px;
		color: rgba(255, 255, 255, 0.5);
		text-transform: uppercase;
		writing-mode: vertical-rl;
		transform: rotate(180deg);
	}
</style>
