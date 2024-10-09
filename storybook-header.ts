import { toJs } from "estree-util-to-js";
import glob from "fast-glob";
import fs from "fs";
import { Root } from "mdast";
import { MdxJsxTextElement } from "mdast-util-mdx-jsx";
import mdx from "remark-mdx";
import markdown from "remark-parse";
import stringify from "remark-stringify";
import { unified } from "unified";
import { SKIP, visit } from "unist-util-visit";

const processor = unified().use(markdown).use(mdx).use(plugin).use(stringify);

function plugin() {
  return function (tree: Root) {
    visit(tree, function (node) {
      if (node.type === "paragraph") {
        const common = node.children.find(
          (child) => child.type === "mdxJsxTextElement"
        ) as MdxJsxTextElement;

        if (!common) {
          return;
        }

        if (common.name === "Title") {
          const content = common.children[0];
          Object.assign(node, {
            type: "heading",
            depth: 1,
            children: [content],
          });
          return SKIP;
        }

        if (common.name === "Secondary") {
          const content = common.children[0];
          Object.assign(node, {
            type: "heading",
            depth: 2,
            children: [content],
          });
          return SKIP;
        }

        if (common.name === "Heading3") {
          const content = common.children[0];
          Object.assign(node, {
            type: "heading",
            depth: 2,
            children: [content],
          });
          return SKIP;
        }

        if (common.name === "Heading4") {
          const content = common.children[0];
          Object.assign(node, {
            type: "heading",
            depth: 3,
            children: [content],
          });
          return SKIP;
        }
      }
    });

    visit(tree, "mdxjsEsm", function (node, index, parent) {
      if (!node.data?.estree?.body) {
        return;
      }
      node.data.estree.body = node.data.estree.body.reduce((decls, decl) => {
        if (
          decl.type === "ImportDeclaration" &&
          (decl.source.value as unknown as string).includes("storybook-common")
        ) {
          decl.specifiers = decl.specifiers.filter((s) => {
            if (s.type === "ImportSpecifier") {
              return !["Heading3", "Heading4", "Title", "Secondary"].includes(
                s.imported.name
              );
            }
            return true;
          });

          if (!decl.specifiers.length) {
            return [...decls];
          }
        }

        return [...decls, decl];
      }, []);

      node.value = toJs(node.data?.estree!).value;

      return SKIP;
    });
  };
}

async function convertHeaders(filePath: string) {
  const file = fs.readFileSync(filePath);
  const newFile = processor.processSync(file);

  // console.log("================= story");
  // console.log(String(newFile));

  fs.writeFileSync(filePath, String(newFile));
}

async function program() {
  const paths = await glob([
    "/Users/roll/lifesg/v3-design-system/stories/**/*.mdx",
  ]);

  for (const filePath of paths) {
    console.log("Converting", filePath);

    try {
      await convertHeaders(filePath);
    } catch (err) {
      console.log("Error with", filePath, err);
    }
  }
}

program();
