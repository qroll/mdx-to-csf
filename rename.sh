for f in `find ../react-design-system-sb7/stories -iname '*.stories.mdx' -type f -print`;do  mv "$f" ${f%.stories.mdx}.mdx; done;

npx tsx index.ts