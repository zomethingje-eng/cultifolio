<script lang="ts">
  import { page } from '$app/state';
</script>
<div class="err">
  <h1>{page.status}</h1>
  <p class="muted">{page.error?.message ?? 'Something went wrong.'}</p>
  {#if page.status === 404 && page.url.pathname.startsWith('/species/')}
    {@const sp = page.error?.species}
    {#if sp}
      <!-- What the reference takes, and where the name is held elsewhere (round forty-one, R15). -->
      {#if sp.inGenus === 0}
        <!-- No "yet": the reference is built from a fixed list of names, and nothing is prepared on demand (round forty-one, R15) -->
        <p>The reference has no {sp.genus}: it is built from a fixed list of names, and none of this genus is on it. <a href="/about/how#list">Which species are here →</a></p>
      {:else}
        <p>The reference has {sp.inGenus} {sp.genus}{sp.inGenus === 1 ? '' : ' species'}{sp.wholeGenus ? `, and takes the genus whole as WCVP lists it, so this name is one Kew does not accept under ${sp.genus}` : `: the genus is not taken whole, only the species of it most often recorded as cultivated`}. <a href="/about/how#list">Which species are here →</a></p>
      {/if}
      <p>Elsewhere: <a href="https://www.gbif.org/species/search?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">GBIF</a> · <a href="https://powo.science.kew.org/results?q={encodeURIComponent(sp.accepted ?? sp.name)}" rel="noopener">POWO (Kew)</a>. You can still <a href="/plants/new?species={encodeURIComponent(sp.accepted ?? sp.name)}">add it as a plant</a>; its record works without a species page.</p>
    {:else}
      <p>This species has no dossier: the reference is built from a fixed list of names, and this one is not on it. You can still <a href="/plants/new">add it as a plant</a>; its record works without a species page.</p>
    {/if}
  {/if}
</div>
<style>.err{max-width:60ch;padding-block:2rem}</style>
