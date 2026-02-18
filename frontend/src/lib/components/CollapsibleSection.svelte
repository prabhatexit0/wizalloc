<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		badge = '',
		description = '',
		open = $bindable(true),
		children,
	}: {
		title: string;
		badge?: string;
		description?: string;
		open?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="collapsible" class:open>
	<button class="header" onclick={() => (open = !open)}>
		<span class="chevron">{open ? '\u25BC' : '\u25B6'}</span>
		<span class="title">{title}</span>
		{#if badge}
			<span class="badge">{badge}</span>
		{/if}
	</button>
	{#if description && open}
		<p class="description">{description}</p>
	{/if}
	{#if open}
		<div class="content">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.collapsible {
		display: flex;
		flex-direction: column;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 6px;
		overflow: hidden;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
	}
	.header:hover {
		background: rgba(255, 255, 255, 0.04);
	}
	.chevron {
		font-size: 8px;
		color: rgba(255, 255, 255, 0.4);
		width: 10px;
		flex-shrink: 0;
	}
	.title {
		font-size: 11px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.7);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
	.badge {
		margin-left: auto;
		font-size: 9px;
		padding: 1px 5px;
		border-radius: 8px;
		background: rgba(0, 122, 204, 0.2);
		color: rgba(0, 180, 255, 0.8);
		font-weight: 500;
	}
	.description {
		margin: 0;
		padding: 0 8px 4px;
		font-size: 10px;
		font-style: italic;
		color: rgba(255, 255, 255, 0.35);
		line-height: 1.4;
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 4px 8px 8px;
	}
</style>
