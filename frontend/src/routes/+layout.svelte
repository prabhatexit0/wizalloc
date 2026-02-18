<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>wizalloc</title>
	<meta name="description" content="Interactive storage engine visualizer powered by Rust/WASM" />
</svelte:head>

<div class="app">
	<header>
		<div class="header-left">
			<span class="brand">wizalloc</span>
		</div>
	</header>

	<main>
		{@render children()}
	</main>

</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}
	:global(body) {
		background: #1e1e1e;
		color: rgba(255, 255, 255, 0.87);
		font-family: Inter, system-ui, -apple-system, sans-serif;
		font-synthesis: none;
		text-rendering: optimizeLegibility;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		overflow: hidden;
		/* Prevent pull-to-refresh and overscroll bounce on mobile */
		overscroll-behavior: none;
	}
	:global(input[type="number"]) {
		-moz-appearance: textfield;
	}
	:global(input[type="number"]::-webkit-inner-spin-button,
	input[type="number"]::-webkit-outer-spin-button) {
		-webkit-appearance: none;
		margin: 0;
	}
	.app {
		height: 100vh;
		height: 100dvh;
		width: 100vw;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding-top: env(safe-area-inset-top, 0px);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 36px;
		padding: 0 16px;
		padding-left: max(16px, env(safe-area-inset-left, 0px));
		padding-right: max(16px, env(safe-area-inset-right, 0px));
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		flex-shrink: 0;
	}
	.header-left {
		display: flex;
		align-items: center;
	}
	.brand {
		font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace;
		font-size: 13px;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.9);
		letter-spacing: -0.3px;
	}
	main {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	@media (max-width: 640px) {
		header {
			padding: 0 12px;
			padding-left: max(12px, env(safe-area-inset-left, 0px));
			padding-right: max(12px, env(safe-area-inset-right, 0px));
		}
	}
</style>
